import { queryMariaDb } from '@/database/clients/mariadb';
import { getQdrantClient, VECTOR_DIM } from '@/database/clients/qdrant';
import { getEmbedding, getEmbeddings } from '@/database/clients/openai';
import {
  PocModelType,
  SeedMedia,
  Poc1SearchTag,
  Poc1MediaResult,
} from '@/types';
import { IPocModel } from './base';
import { buildCombinedParagraph } from './mariadb-qdrant.model';
import { fetchAllTags } from './tag-helpers';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POC3_COLLECTION = 'media_free_text_poc3';
const TOP_N = 50;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface Step1Row {
  media_id: number;
  nm_match_count: number;
}

interface MediaRow {
  id: number;
  url: string;
  visual_qa_score: number;
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export class MariaDbQdrantHybridModel implements IPocModel {
  readonly name = PocModelType.MARIADB_QDRANT_HYBRID;

  // ========================================================================
  // MIGRATE  (drop → create → index → seed)
  // ========================================================================

  async migrate(data: SeedMedia[]): Promise<void> {
    const client = getQdrantClient();

    const { collections } = await client.getCollections();
    if (collections.some((c) => c.name === POC3_COLLECTION)) {
      await client.deleteCollection(POC3_COLLECTION);
    }

    await client.createCollection(POC3_COLLECTION, {
      vectors: { size: VECTOR_DIM, distance: 'Cosine' },
    });

    await client.createPayloadIndex(POC3_COLLECTION, {
      field_name: 'media_id',
      field_schema: 'integer',
    });

    await this.seed(data);
  }

  // ========================================================================
  // SEED
  // ========================================================================

  async seed(data: SeedMedia[]): Promise<void> {
    if (data.length === 0) return;

    // ── Step 1: Fetch all media ids from MariaDB ──────────────────────────
    const urlToId = new Map<string, number>();
    const URL_BATCH = 5_000;
    const allUrls = data.map((d) => d.mediaUrl);
    for (const chunk of chunkArray(allUrls, URL_BATCH)) {
      const placeholders = chunk.map(() => '?').join(', ');
      const rows = await queryMariaDb<{ id: number; url: string }>(
        `SELECT id, url FROM media WHERE url IN (${placeholders})`,
        chunk
      );
      for (const r of rows) urlToId.set(r.url, r.id);
    }

    // ── Step 2: Build combined paragraph per media item ───────────────────
    type PointData = { mediaId: number; combinedText: string };
    const pointDataList: PointData[] = [];

    for (const item of data) {
      const mediaId = urlToId.get(item.mediaUrl);
      if (mediaId === undefined) continue;

      const freeTextMap: Record<string, string> = {};
      for (const tag of item.tags) {
        if (tag.type === 'FREE_TEXT' && tag.value) {
          freeTextMap[tag.name] = tag.value;
        }
      }

      const combinedText = buildCombinedParagraph(freeTextMap);
      pointDataList.push({ mediaId, combinedText });
    }

    if (pointDataList.length === 0) return;

    // ── Step 3: Batch-embed all combined paragraphs ───────────────────────
    const EMBED_CHUNK = 500;
    const allTexts = pointDataList.map((p) => p.combinedText || ' ');
    const allEmbeddings: number[][] = [];
    for (const chunk of chunkArray(allTexts, EMBED_CHUNK)) {
      const embeddings = await getEmbeddings(chunk);
      allEmbeddings.push(...embeddings);
    }

    // ── Step 4: Upsert to Qdrant in batches of 100 ───────────────────────
    const UPSERT_BATCH = 100;
    for (let start = 0; start < pointDataList.length; start += UPSERT_BATCH) {
      const chunkData = pointDataList.slice(start, start + UPSERT_BATCH);
      await getQdrantClient().upsert(POC3_COLLECTION, {
        points: chunkData.map((p, idx) => ({
          id: p.mediaId,
          vector: allEmbeddings[start + idx],
          payload: {
            media_id:      p.mediaId,
            combined_text: p.combinedText,
          },
        })),
      });
    }
  }

  // ========================================================================
  // SEARCH
  // ========================================================================

  async search(rawTags: unknown[], minQaScore = 0): Promise<Poc1MediaResult[]> {
    const tags = rawTags as Poc1SearchTag[];

    // ── Step 0: Classify tags ─────────────────────────────────────────────
    const mTags  = tags.filter((t) => t.type === 'FIXED' && t.isMandatory === true);
    const nmTags = tags.filter((t) => t.type === 'FIXED' && !t.isMandatory);
    const ftTags = tags.filter((t) => t.type === 'FREE_TEXT');

    // ── Step 1: MariaDB — M hard filter + NM soft score ───────────────────
    const step1 = await this.step1FixedTagFilter(mTags, nmTags);
    if (step1.length === 0) return [];

    const step1MediaIds = step1.map((r) => r.media_id);
    const total = step1MediaIds.length;

    // rank_1: position in nm_match_count desc order (1-indexed)
    const rank1Map = new Map<number, number>();
    step1.forEach((r, idx) => rank1Map.set(r.media_id, idx + 1));

    // ── Step 2: Qdrant — vector search scoped to step1 ids ───────────────
    const rank2Map = new Map<number, number>();

    if (ftTags.length > 0) {
      const freeTextMap: Record<string, string> = {};
      for (const tag of ftTags) {
        // tag.values is comma-separated; use first value as the query text
        const firstVal = tag.values.split(',')[0]?.trim() ?? '';
        if (firstVal) freeTextMap[tag.name] = firstVal;
      }

      const paragraph = buildCombinedParagraph(freeTextMap);
      if (paragraph.trim()) {
        const queryVector = await getEmbedding(paragraph);

        const results = await getQdrantClient().search(POC3_COLLECTION, {
          vector: queryVector,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          filter: { must: [{ key: 'media_id', match: { any: step1MediaIds } as any }] } as any,
          limit: step1MediaIds.length,
          with_payload: true,
          with_vector: false,
        });

        results.forEach((r, idx) => {
          const mediaId = (r.payload?.media_id as number) ?? (r.id as number);
          rank2Map.set(mediaId, idx + 1);
        });
      }
    }

    // ── Step 3: Fetch media metadata ─────────────────────────────────────
    const mediaMap = new Map<number, MediaRow>();
    const META_BATCH = 5_000;
    for (const chunk of chunkArray(step1MediaIds, META_BATCH)) {
      const placeholders = chunk.map(() => '?').join(', ');
      const rows = await queryMariaDb<MediaRow>(
        `SELECT id, url, visual_qa_score FROM media WHERE id IN (${placeholders})`,
        chunk
      );
      for (const r of rows) mediaMap.set(r.id, r);
    }

    // ── Step 4: Final weighted ranking ────────────────────────────────────
    const ranked = step1MediaIds.map((mediaId) => {
      const r1 = rank1Map.get(mediaId) ?? total;
      const r2 = rank2Map.get(mediaId) ?? total;
      return { mediaId, finalRank: 0.5 * r1 + 0.5 * r2 };
    });

    ranked.sort((a, b) => {
      if (a.finalRank !== b.finalRank) return a.finalRank - b.finalRank;
      const vqaA = Number(mediaMap.get(a.mediaId)?.visual_qa_score ?? 0);
      const vqaB = Number(mediaMap.get(b.mediaId)?.visual_qa_score ?? 0);
      return vqaB - vqaA;
    });

    const top = ranked
      .filter((r) => Number(mediaMap.get(r.mediaId)?.visual_qa_score ?? 0) >= minQaScore)
      .slice(0, TOP_N);

    const tagsByMedia = await fetchAllTags(top.map((r) => r.mediaId));

    return top.map((r) => {
      const media = mediaMap.get(r.mediaId);
      return {
        id: r.mediaId,
        url: media?.url ?? '',
        visualQaScore: Number(media?.visual_qa_score ?? 0),
        tags: tagsByMedia.get(r.mediaId) ?? [],
        finalRank: Math.round(r.finalRank * 1000) / 1000,
      };
    });
  }

  // ========================================================================
  // Step 1: MariaDB fixed-tag filter + NM scoring
  // ========================================================================

  private async step1FixedTagFilter(
    mTags: Poc1SearchTag[],
    nmTags: Poc1SearchTag[]
  ): Promise<Step1Row[]> {
    // ── Inner subquery: mandatory tag filter ───────────────────────────────
    let innerSubquery: string;
    const innerParams: unknown[] = [];

    if (mTags.length > 0) {
      const mConditions = mTags.flatMap((t) => {
        return t.values
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean)
          .map((v) => {
            innerParams.push(t.name, v);
            return '(name = ? AND value = ?)';
          });
      });

      innerSubquery = `
        SELECT media_id
        FROM one_media_fixed_tag
        WHERE ${mConditions.join(' OR ')}
        GROUP BY media_id
        HAVING COUNT(DISTINCT CONCAT(name, ':', value)) >= ?
      `;
      // Each distinct M tag must match at least one value
      innerParams.push(mTags.length);
    } else {
      // No mandatory tags: all media are candidates
      innerSubquery = 'SELECT DISTINCT id AS media_id FROM media';
    }

    // ── Outer query: NM match count scoring ────────────────────────────────
    if (nmTags.length === 0) {
      const rows = await queryMariaDb<{ media_id: number }>(
        `SELECT media_id FROM (${innerSubquery}) AS m_filtered`,
        innerParams
      );
      return rows.map((r) => ({ media_id: r.media_id, nm_match_count: 0 }));
    }

    const nmConditions: string[] = [];
    const outerParams: unknown[] = [];

    for (const t of nmTags) {
      for (const v of t.values.split(',').map((v) => v.trim()).filter(Boolean)) {
        nmConditions.push('(mft.name = ? AND mft.value = ?)');
        outerParams.push(t.name, v);
      }
    }

    const nmCaseExpr = `SUM(CASE WHEN ${nmConditions.join(' OR ')} THEN 1 ELSE 0 END)`;

    const sql = `
      SELECT
        mft.media_id,
        ${nmCaseExpr} AS nm_match_count
      FROM one_media_fixed_tag mft
      WHERE mft.media_id IN (${innerSubquery})
      GROUP BY mft.media_id
      ORDER BY nm_match_count DESC
    `;

    return queryMariaDb<Step1Row>(sql, [...outerParams, ...innerParams]);
  }
}
