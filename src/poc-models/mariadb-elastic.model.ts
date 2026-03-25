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
    };

    const docDataList: DocData[] = [];

    for (const item of data) {
      const mediaId = urlToId.get(item.mediaUrl);
      if (mediaId === undefined) continue;

      const freeTextMap: Record<string, string> = {};
      const fixedFields: Record<string, number> = {};

      for (const tag of item.tags) {
        if (tag.type === 'FREE_TEXT') {
          if (tag.value) freeTextMap[tag.name] = tag.value;
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

    // ── Step 1: Build query vector from free-text tags ────────────────────
    let queryVector: number[] | null = null;
    if (ftTags.length > 0) {
      const freeTextMap: Record<string, string> = {};
      for (const tag of ftTags) {
        freeTextMap[tag.name] = tag.values;
      }
      const paragraph = buildCombinedParagraph(freeTextMap);
      if (paragraph.trim()) {
        queryVector = await getEmbedding(paragraph);
      }
    }

    // ── Step 2: Build must-filter clauses from mandatory fixed tags ────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mustClauses: any[] = mTags.flatMap((tag) => {
      const fieldName = FIXED_TAG_FIELD[tag.name];
      const valueMap  = FIXED_TAG_VALUE_MAP[tag.name];
      if (!fieldName || !valueMap) return [];
      return tag.values
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
        .map((v) => ({ term: { [fieldName]: valueMap[v] ?? 0 } }));
    });

    // ── Step 3: Build function_score functions from optional fixed tags ────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nmFunctions: any[] = nmTags.flatMap((tag) => {
      const fieldName = FIXED_TAG_FIELD[tag.name];
      const valueMap  = FIXED_TAG_VALUE_MAP[tag.name];
      if (!fieldName || !valueMap) return [];
      return tag.values
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
        .map((v) => ({
          filter: { term: { [fieldName]: valueMap[v] ?? 0 } },
          weight: 1,
        }));
    });

    // ── Step 4: Compose BM25 request body ─────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bm25Body: Record<string, any> = {
      size: 100,
      query: {
        function_score: {
          query: {
            bool: {
              must: mustClauses,   // empty array = match all
            },
          },
          functions:  nmFunctions,  // empty array = score 0 for all
          score_mode: 'sum',        // sum NM weights
          boost_mode: 'replace',    // final score = NM sum only
        },
      },
    };

    // ── Step 5: Execute search(es) ─────────────────────────────────────────
    type RawHit = { _score: number | null; _source: Record<string, unknown> };

    type ScoredDoc = {
      mediaId: number;
      url: string;
      visualQaScore: number;
      rrfScore: number;
    };

    const es = getElasticsearchClient();

    let scored: ScoredDoc[];

    if (queryVector) {
      // Run KNN and BM25 queries in parallel
      const knnBody = {
        size: 100,
        knn: {
          field:          'embedding',
          query_vector:   queryVector,
          num_candidates: 100,
          filter: {
            bool: { must: mustClauses },
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
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`POC 4 search unavailable: ${msg}`);
      }

      // Build rank maps (1-based)
      const knnRank  = new Map<number, number>();
      const bm25Rank = new Map<number, number>();
      knnHits.forEach((h, i)  => knnRank.set(Number(h._source['media_id']),  i + 1));
      bm25Hits.forEach((h, i) => bm25Rank.set(Number(h._source['media_id']), i + 1));

      // Collect all unique docs from both lists
      const allDocs = new Map<number, { url: string; visualQaScore: number }>();
      for (const h of [...knnHits, ...bm25Hits]) {
        const id = Number(h._source['media_id']);
        if (!allDocs.has(id)) {
          allDocs.set(id, {
            url:           String(h._source['url'] ?? ''),
            visualQaScore: Number(h._source['visual_qa_score'] ?? 0),
          });
        }
      }

      // Apply manual RRF: score = 1/(k+rank_knn) + 1/(k+rank_bm25); k=60
      const RRF_K = 60;
      scored = Array.from(allDocs.entries()).map(([mediaId, doc]) => {
        const rKnn  = knnRank.get(mediaId)  ?? Infinity;
        const rBm25 = bm25Rank.get(mediaId) ?? Infinity;
        const rrfScore =
          (rKnn  < Infinity ? 1 / (RRF_K + rKnn)  : 0) +
          (rBm25 < Infinity ? 1 / (RRF_K + rBm25) : 0);
        return { mediaId, url: doc.url, visualQaScore: doc.visualQaScore, rrfScore };
      });
    } else {
      let bm25Hits: RawHit[];
      try {
        const resp = await es.search({ index: ES_INDEX, ...bm25Body });
        bm25Hits = resp.hits.hits as RawHit[];
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`POC 4 search unavailable: ${msg}`);
      }

      scored = bm25Hits.map((hit) => ({
        mediaId:       Number(hit._source['media_id']),
        url:           String(hit._source['url'] ?? ''),
        visualQaScore: Number(hit._source['visual_qa_score'] ?? 0),
        rrfScore:      hit._score ?? 0,
      }));
    }

    if (scored.length === 0) return [];

    // ── Step 6: Sort, filter, return top 50 ──────────────────────────────
    // PRIMARY: RRF/BM25 score descending (higher = better)
    // TIEBREAK: visual_qa_score descending
    scored.sort((a, b) => {
      if (b.rrfScore !== a.rrfScore) return b.rrfScore - a.rrfScore;
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
      finalRank:     Math.round(d.rrfScore * 10000) / 10000,
    }));
  }
}
