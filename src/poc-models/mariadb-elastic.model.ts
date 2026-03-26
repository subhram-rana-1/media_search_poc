import { queryMariaDb } from '@/database/clients/mariadb';
import { getElasticsearchClient, ES_INDEX } from '@/database/clients/elasticsearch';
import { getEmbedding, getEmbeddings } from '@/database/clients/openai';
import {
  PocModelType,
  SeedMedia,
  Poc1SearchTag,
  Poc1MediaResult,
} from '@/types';
import { IPocModel } from './base';
import { fetchAllTags } from './tag-helpers';
import {
  FIXED_TAG_FIELD,
  FIXED_TAG_VALUE_MAP,
  buildCombinedParagraph,
} from './mariadb-qdrant.model';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

// ---------------------------------------------------------------------------
// ES index mapping
// All 17 fixed tag fields stored as integers (matching FIXED_TAG_VALUE_MAP keys).
// ---------------------------------------------------------------------------

const FIXED_TAG_ES_PROPERTIES = Object.fromEntries(
  Object.values(FIXED_TAG_FIELD).map((field) => [field, { type: 'integer' }])
);

// Free-text tag names — one dedicated text field per tag type for BM25.
// Searching individual short fields avoids BM25 length-normalisation bias
// that combined_text suffers from when documents have differing tag counts.
const FREE_TEXT_TAG_NAMES = [
  'PoiName', 'Environment', 'City', 'Food', 'Drinks', 'Wildlife', 'Artwork', 'Artist',
] as const;

export function ftFieldName(tagName: string): string {
  return `ft_${tagName.toLowerCase()}`;
}

const FREE_TEXT_ES_PROPERTIES = Object.fromEntries(
  FREE_TEXT_TAG_NAMES.map((name) => [ftFieldName(name), { type: 'text' }])
);

const ES_INDEX_MAPPING = {
  settings: {
    number_of_shards: 1,
    number_of_replicas: 0,
  },
  mappings: {
    properties: {
      media_id:        { type: 'integer' },
      url:             { type: 'keyword' },
      visual_qa_score: { type: 'float' },
      combined_text:   { type: 'text' },
      embedding: {
        type:       'dense_vector',
        dims:       1536,
        index:      true,
        similarity: 'cosine',
      },
      ...FIXED_TAG_ES_PROPERTIES,
      ...FREE_TEXT_ES_PROPERTIES,
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export class MariaDbElasticModel implements IPocModel {
  readonly name = PocModelType.MARIADB_ELASTIC;

  // ========================================================================
  // MIGRATE  (drop index → recreate → seed)
  // ========================================================================

  async migrate(data: SeedMedia[]): Promise<void> {
    const es = getElasticsearchClient();

    // Drop existing index if present
    const exists = await es.indices.exists({ index: ES_INDEX });
    if (exists) {
      await es.indices.delete({ index: ES_INDEX });
    }

    // Create index with full mapping
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await es.indices.create({ index: ES_INDEX, ...ES_INDEX_MAPPING } as any);

    await this.seed(data);
  }

  // ========================================================================
  // SEED
  // ========================================================================

  async seed(data: SeedMedia[]): Promise<void> {
    if (data.length === 0) return;

    const es = getElasticsearchClient();

    // ── Step 1: Resolve media IDs from MariaDB ────────────────────────────
    const urlToId = new Map<string, number>();
    const URL_BATCH = 5_000;
    for (const chunk of chunkArray(data.map((d) => d.mediaUrl), URL_BATCH)) {
      const placeholders = chunk.map(() => '?').join(', ');
      const rows = await queryMariaDb<{ id: number; url: string }>(
        `SELECT id, url FROM media WHERE url IN (${placeholders})`,
        chunk
      );
      for (const r of rows) urlToId.set(r.url, r.id);
    }

    // ── Step 2: Build document data per media item ────────────────────────
    type DocData = {
      mediaId: number;
      url: string;
      visualQaScore: number;
      combinedText: string;
      fixedFields: Record<string, number>;
      freeTextFields: Record<string, string>; // ft_poiname, ft_city, etc.
    };

    const docDataList: DocData[] = [];

    for (const item of data) {
      const mediaId = urlToId.get(item.mediaUrl);
      if (mediaId === undefined) continue;

      const freeTextMap: Record<string, string> = {};
      const fixedFields: Record<string, number> = {};
      const freeTextFields: Record<string, string> = {};

      for (const tag of item.tags) {
        if (tag.type === 'FREE_TEXT') {
          if (tag.value) {
            freeTextMap[tag.name] = tag.value;
            // Store raw value in its individual ft_* field for targeted BM25.
            freeTextFields[ftFieldName(tag.name)] = tag.value;
          }
        } else {
          const fieldName = FIXED_TAG_FIELD[tag.name];
          const valueMap  = FIXED_TAG_VALUE_MAP[tag.name];
          if (fieldName && valueMap) {
            const intVal = valueMap[tag.value] ?? valueMap[tag.values?.[0]] ?? 0;
            if (intVal > 0) fixedFields[fieldName] = intVal;
          }
        }
      }

      docDataList.push({
        mediaId,
        url: item.mediaUrl,
        visualQaScore: item.visualQaScore,
        combinedText: buildCombinedParagraph(freeTextMap),
        fixedFields,
        freeTextFields,
      });
    }

    if (docDataList.length === 0) return;

    // ── Step 3: Batch-embed all combined paragraphs ───────────────────────
    const EMBED_CHUNK = 500;
    const allTexts = docDataList.map((d) => d.combinedText || ' ');
    const allEmbeddings: number[][] = [];
    for (const chunk of chunkArray(allTexts, EMBED_CHUNK)) {
      allEmbeddings.push(...(await getEmbeddings(chunk)));
    }

    // ── Step 4: Bulk index into ES in batches of 100 ─────────────────────
    const BULK_BATCH = 100;
    for (let start = 0; start < docDataList.length; start += BULK_BATCH) {
      const chunkDocs = docDataList.slice(start, start + BULK_BATCH);
      const operations = chunkDocs.flatMap((d, idx) => [
        { index: { _index: ES_INDEX, _id: String(d.mediaId) } },
        {
          media_id:        d.mediaId,
          url:             d.url,
          visual_qa_score: d.visualQaScore,
          combined_text:   d.combinedText,
          embedding:       allEmbeddings[start + idx],
          ...d.fixedFields,
          ...d.freeTextFields,
        },
      ]);
      await es.bulk({ operations, refresh: false });
    }

    // Flush so documents are immediately searchable
    await es.indices.refresh({ index: ES_INDEX });
  }

  // ========================================================================
  // SEARCH  (entirely within Elasticsearch — no MariaDB at query time)
  // ========================================================================

  async search(rawTags: unknown[], minQaScore = 0): Promise<Poc1MediaResult[]> {
    const tags = rawTags as Poc1SearchTag[];

    // ── Step 0: Classify tags ─────────────────────────────────────────────
    const mTags  = tags.filter((t) => t.type === 'FIXED' && t.isMandatory === true);
    const nmTags = tags.filter((t) => t.type === 'FIXED' && !t.isMandatory);
    const ftTags = tags.filter((t) => t.type === 'FREE_TEXT');

    // ── Step 1: Build query vector and paragraph from free-text tags ─────
    // queryParagraph is kept in scope so the BM25 query can reuse the same text.
    let queryVector: number[] | null = null;
    let queryParagraph = '';
    if (ftTags.length > 0) {
      const freeTextMap: Record<string, string> = {};
      for (const tag of ftTags) {
        freeTextMap[tag.name] = tag.values;
      }
      const paragraph = buildCombinedParagraph(freeTextMap);
      if (paragraph.trim()) {
        queryParagraph = paragraph;
        queryVector = await getEmbedding(paragraph);
      }
    }

    // ── Step 2: Build M-tag filter clauses (hard filter — no scoring) ─────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filterClauses: any[] = mTags.flatMap((tag) => {
      const fieldName = FIXED_TAG_FIELD[tag.name];
      const valueMap  = FIXED_TAG_VALUE_MAP[tag.name];
      if (!fieldName || !valueMap) return [];
      return tag.values
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
        .map((v) => ({ term: { [fieldName]: valueMap[v] ?? 0 } }));
    });

    // ── Step 3: Build NM match list for in-app scoring ────────────────────
    // One entry per NM tag value term: { fieldName, intValue }.
    // NM match count is computed in TypeScript from _source rather than via
    // function_score, because function_score falls back to the base query
    // score (1.0) for documents that match no function filter, making all
    // documents appear equally scored.
    const nmTagMatches: { fieldName: string; intValue: number }[] =
      nmTags.flatMap((tag) => {
        const fieldName = FIXED_TAG_FIELD[tag.name];
        const valueMap  = FIXED_TAG_VALUE_MAP[tag.name];
        if (!fieldName || !valueMap) return [];
        return tag.values
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean)
          .flatMap((v) => {
            const intValue = valueMap[v];
            return intValue !== undefined ? [{ fieldName, intValue }] : [];
          });
      });

    // Max possible NM score = total NM tag value terms.
    // Used to normalize nmScore into [0, 1].
    const totalNmValues = nmTagMatches.length;

    // ── Step 4: Compose candidate fetch query (M-filter only) ─────────────
    const nmScoreBody = {
      size: 1000,
      query: { bool: { filter: filterClauses } },
    };

    // ── Step 5: Execute search(es) ────────────────────────────────────────
    type RawHit = { _score: number | null; _source: Record<string, unknown> };

    type ScoredDoc = {
      mediaId: number;
      url: string;
      visualQaScore: number;
      nmScore: number;   // raw NM match count (0 – totalNmValues)
      knnScore: number;  // cosine similarity from KNN (0 – 1); 0 if no KNN
      bm25Score: number; // BM25 text relevance score; 0 if no free-text tags
    };

    const es = getElasticsearchClient();

    // Always fetch the NM-scored result set (M-filtered candidates).
    let nmHits: RawHit[];
    try {
      const nmResp = await es.search({ index: ES_INDEX, ...nmScoreBody });
      nmHits = nmResp.hits.hits as RawHit[];
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`POC 4 search unavailable: ${msg}`);
    }

    // Seed the merged doc map from NM hits.
    const allDocs = new Map<number, ScoredDoc>();
    for (const h of nmHits) {
      const mediaId = Number(h._source['media_id']);
      allDocs.set(mediaId, {
        mediaId,
        url:           String(h._source['url'] ?? ''),
        visualQaScore: Number(h._source['visual_qa_score'] ?? 0),
        nmScore:       nmTagMatches.filter(({ fieldName, intValue }) =>
                         Number(h._source[fieldName]) === intValue
                       ).length,
        knnScore:      0,
        bm25Score:     0,
      });
    }

    // maxBm25Score is declared here so it is in scope during finalScore computation.
    let maxBm25Score = 1;

    // If free-text tags produced a query paragraph, run KNN and BM25 in parallel.
    if (queryVector) {
      const knnBody = {
        size: 200,
        knn: {
          field:          'embedding',
          query_vector:   queryVector,
          num_candidates: 200,
          filter: {
            bool: { filter: filterClauses },
          },
        },
      };

      // BM25 on individual ft_* fields — one should-clause per queried free-text
      // tag, each targeting its own short field. This eliminates the length-
      // normalisation bias that combined_text had (more tags → longer text →
      // lower per-term score even for exact matches).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bm25Shoulds: any[] = ftTags.map((tag) => ({
        match: {
          [ftFieldName(tag.name)]: {
            query:    tag.values,
            operator: 'and',
          },
        },
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bm25Body: Record<string, any> = {
        size: 200,
        query: {
          bool: {
            should:               bm25Shoulds,
            filter:               filterClauses,
            minimum_should_match: 1,
          },
        },
      };

      let knnHits: RawHit[];
      let bm25Hits: RawHit[];
      try {
        const [knnResp, bm25Resp] = await Promise.all([
          es.search({ index: ES_INDEX, ...knnBody }),
          es.search({ index: ES_INDEX, ...bm25Body }),
        ]);
        knnHits  = knnResp.hits.hits  as RawHit[];
        bm25Hits = bm25Resp.hits.hits as RawHit[];
        // Use ES-provided max_score as the normalisation denominator.
        maxBm25Score = (bm25Resp.hits.max_score ?? 1) || 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`POC 4 search unavailable: ${msg}`);
      }

      // Merge KNN scores. Docs absent from the NM top-1000 are inserted with nmScore = 0.
      for (const h of knnHits) {
        const mediaId  = Number(h._source['media_id']);
        const knnScore = h._score ?? 0;
        const existing = allDocs.get(mediaId);
        if (existing) {
          existing.knnScore = knnScore;
        } else {
          allDocs.set(mediaId, {
            mediaId,
            url:           String(h._source['url'] ?? ''),
            visualQaScore: Number(h._source['visual_qa_score'] ?? 0),
            nmScore:       0,
            knnScore,
            bm25Score:     0,
          });
        }
      }

      // Merge BM25 scores. Same pattern as KNN.
      for (const h of bm25Hits) {
        const mediaId  = Number(h._source['media_id']);
        const bm25Score = h._score ?? 0;
        const existing = allDocs.get(mediaId);
        if (existing) {
          existing.bm25Score = bm25Score;
        } else {
          allDocs.set(mediaId, {
            mediaId,
            url:           String(h._source['url'] ?? ''),
            visualQaScore: Number(h._source['visual_qa_score'] ?? 0),
            nmScore:       0,
            knnScore:      0,
            bm25Score,
          });
        }
      }
    }

    if (allDocs.size === 0) return [];

    // ── Step 6: Normalize scores and compute finalScore ───────────────────
    // nmScoreNorm  ∈ [0, 1]: nmScore / totalNmValues
    // knnScoreNorm ∈ [0, 1]: ES cosine KNN _score is already in this range
    // bm25ScoreNorm ∈ [0, 1]: bm25Score / maxBm25Score
    //
    // ftScoreNorm = 0.7 × bm25ScoreNorm + 0.3 × knnScoreNorm
    //   (keyword match dominates; semantic provides fallback for concept searches)
    //
    // finalScore weights:
    //   NM + FT  →  0.5 × nmScoreNorm + 0.5 × ftScoreNorm
    //   NM only  →  nmScoreNorm
    //   FT only  →  ftScoreNorm
    //   neither  →  0  (fall through to visualQaScore tiebreak)
    const hasNm = totalNmValues > 0;
    const hasFt = queryVector !== null;

    type FinalDoc = ScoredDoc & { finalScore: number };
    const scored: FinalDoc[] = Array.from(allDocs.values()).map((doc) => {
      const nmScoreNorm   = hasNm ? doc.nmScore / totalNmValues : 0;
      const knnScoreNorm  = doc.knnScore;                      // already [0, 1]
      const bm25ScoreNorm = doc.bm25Score / maxBm25Score;      // normalised to [0, 1]
      const ftScoreNorm   = 0.7 * bm25ScoreNorm + 0.3 * knnScoreNorm;

      let finalScore: number;
      if (hasNm && hasFt) {
        finalScore = 0.5 * nmScoreNorm + 0.5 * ftScoreNorm;
      } else if (hasNm) {
        finalScore = nmScoreNorm;
      } else if (hasFt) {
        finalScore = ftScoreNorm;
      } else {
        finalScore = 0;
      }

      return { ...doc, finalScore };
    });

    // ── Step 7: Sort, filter, return top 50 ──────────────────────────────
    // PRIMARY:   finalScore descending
    // TIEBREAK:  visualQaScore descending
    scored.sort((a, b) => {
      if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
      return b.visualQaScore - a.visualQaScore;
    });

    const top = scored
      .filter((d) => d.visualQaScore >= minQaScore)
      .slice(0, 50);

    const tagsByMedia = await fetchAllTags(top.map((d) => d.mediaId));

    return top.map((d) => ({
      id:            d.mediaId,
      url:           d.url,
      visualQaScore: d.visualQaScore,
      tags:          tagsByMedia.get(d.mediaId) ?? [],
      finalRank:     Math.round(d.finalScore * 10000) / 10000,
    }));
  }
}
