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

    // ── Step 4: Compose ES request body ───────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const requestBody: Record<string, any> = {
      size: 50,
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

    if (queryVector) {
      requestBody['knn'] = {
        field:          'embedding',
        query_vector:   queryVector,
        num_candidates: 100,
        filter: {
          bool: { must: mustClauses },
        },
      };

      requestBody['rank'] = {
        rrf: {
          window_size:   50,
          rank_constant: 60,
        },
      };
    }

    // ── Step 5: Execute search ─────────────────────────────────────────────
    let hits: Array<{ _score: number | null; _source: Record<string, unknown> }>;
    try {
      const es = getElasticsearchClient();
      const response = await es.search({ index: ES_INDEX, ...requestBody });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      hits = response.hits.hits as any;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`POC 4 search unavailable: ${msg}`);
    }

    if (hits.length === 0) return [];

    // ── Step 6: Extract, tiebreak, filter, return top 5 ──────────────────
    type ScoredDoc = {
      mediaId: number;
      url: string;
      visualQaScore: number;
      rrfScore: number;
    };

    const scored: ScoredDoc[] = hits.map((hit) => ({
      mediaId:       Number(hit._source['media_id']),
      url:           String(hit._source['url'] ?? ''),
      visualQaScore: Number(hit._source['visual_qa_score'] ?? 0),
      rrfScore:      hit._score ?? 0,
    }));

    // PRIMARY: RRF score descending (higher = better)
    // TIEBREAK: visual_qa_score descending
    scored.sort((a, b) => {
      if (b.rrfScore !== a.rrfScore) return b.rrfScore - a.rrfScore;
      return b.visualQaScore - a.visualQaScore;
    });

    return scored
      .filter((d) => d.visualQaScore >= minQaScore)
      .slice(0, 5)
      .map((d, idx) => ({
        id:             d.mediaId,
        url:            d.url,
        visualQaScore:  d.visualQaScore,
        tags:           [],
        finalRank:      Math.round(d.rrfScore * 10000) / 10000,
      }));
  }
}
