import { queryMariaDb } from '@/database/clients/mariadb';
import { getEmbedding } from '@/database/clients/openai';
import {
  Poc1MediaResult,
  Poc1ResultTag,
  Poc1SearchTag,
  PocModelType,
  SeedMedia,
  ConfidenceLevel,
} from '@/types';
import { IPocModel } from './base';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CONFIDENCE_TO_INT: Record<string, number> = {
  [ConfidenceLevel.LOW]: 1,
  [ConfidenceLevel.MEDIUM]: 2,
  [ConfidenceLevel.HIGH]: 3,
};

const INT_TO_CONFIDENCE: Record<number, string> = {
  1: 'LOW',
  2: 'MEDIUM',
  3: 'HIGH',
};

const RANK_WEIGHT = 0.5;
const TOP_N = 5;

interface MediaRow {
  id: number;
  url: string;
  visual_qa_score: number;
}

interface Step1Row {
  media_id: number;
  nm_match_count: number;
}

interface Step2Row {
  media_id: number;
  free_text_score: number;
}

interface FixedTagRow {
  media_id: number;
  name: string;
  value: string;
  confidence_level: number;
}

interface FreeTextTagRow {
  media_id: number;
  name: string;
  value: string;
  confidence_level: number;
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export class MariaDbOnlyModel implements IPocModel {
  readonly name = PocModelType.MARIADB_ONLY;

  // ========================================================================
  // SEARCH
  // ========================================================================

  async search(rawTags: unknown[], minQaScore = 0): Promise<Poc1MediaResult[]> {
    const tags = rawTags as Poc1SearchTag[];

    // --- Step 0: classify --------------------------------------------------
    const mTags = tags.filter(
      (t) => t.type === 'FIXED' && t.isMandatory === true
    );
    const nmTags = tags.filter(
      (t) => t.type === 'FIXED' && !t.isMandatory
    );
    const ftTags = tags.filter((t) => t.type === 'FREE_TEXT');

    // --- Step 1: fixed-tag filtering + NM scoring --------------------------
    const step1 = await this.step1FixedTagFilter(mTags, nmTags);
    if (step1.length === 0) return [];

    const step1MediaIds = step1.map((r) => r.media_id);

    // Assign sort_order_1 ranks (1 = highest nm_match_count)
    const sortOrder1 = new Map<number, number>();
    step1.forEach((r, idx) => sortOrder1.set(r.media_id, idx + 1));

    // --- Step 2: free text vector search -----------------------------------
    const sortOrder2 = new Map<number, number>();

    if (ftTags.length > 0) {
      const step2 = await this.step2FreeTextSearch(ftTags, step1MediaIds);

      // Assign sort_order_2 ranks
      step2.forEach((r, idx) => sortOrder2.set(r.media_id, idx + 1));
    }

    const totalCount = step1MediaIds.length;

    // --- Step 3: weighted ranking ------------------------------------------
    const ranked: { mediaId: number; finalScore: number }[] = [];

    for (const mediaId of step1MediaIds) {
      const rank1 = sortOrder1.get(mediaId) ?? totalCount;
      const rank2 = sortOrder2.get(mediaId) ?? totalCount;
      const finalScore = RANK_WEIGHT * rank1 + RANK_WEIGHT * rank2;
      ranked.push({ mediaId, finalScore });
    }

    // Fetch media details for sorting tiebreaker
    const mediaMap = await this.fetchMediaDetails(step1MediaIds);

    ranked.sort((a, b) => {
      if (a.finalScore !== b.finalScore) return a.finalScore - b.finalScore;
      const vqaA = mediaMap.get(a.mediaId)?.visual_qa_score ?? 0;
      const vqaB = mediaMap.get(b.mediaId)?.visual_qa_score ?? 0;
      return vqaB - vqaA; // higher visual_qa_score wins tiebreak
    });

    const top = ranked.slice(0, TOP_N);
    const topMediaIds = top.map((r) => r.mediaId);

    // Fetch all tags for the top results
    const tagsByMedia = await this.fetchAllTags(topMediaIds);

    return top
      .filter((r) => Number(mediaMap.get(r.mediaId)?.visual_qa_score ?? 0) >= minQaScore)
      .map((r) => {
        const media = mediaMap.get(r.mediaId);
        return {
          id: r.mediaId,
          url: media?.url ?? '',
          visualQaScore: Number(media?.visual_qa_score ?? 0),
          tags: tagsByMedia.get(r.mediaId) ?? [],
          finalScore: Math.round(r.finalScore * 1000) / 1000,
        };
      });
  }

  // ========================================================================
  // Step 1: fixed-tag filtering
  // ========================================================================

  private async step1FixedTagFilter(
    mTags: Poc1SearchTag[],
    nmTags: Poc1SearchTag[]
  ): Promise<Step1Row[]> {
    // Build inner subquery for mandatory tags (if any)
    let innerSubquery: string;
    const innerParams: unknown[] = [];

    if (mTags.length > 0) {
      const mConditions = mTags.flatMap((t) => {
        const vals = t.values
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean);
        return vals.map((v) => {
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
      // We need COUNT of DISTINCT (name, value) combos to equal the number of M_tags.
      // Each M_tag must match at least one of its values.
      innerParams.push(mTags.length);
    } else {
      innerSubquery = 'SELECT DISTINCT id AS media_id FROM media';
    }

    // Build outer NM scoring
    if (nmTags.length === 0) {
      // No NM tags — just return media_ids with nm_match_count = 0
      const rows = await queryMariaDb<{ media_id: number }>(
        `SELECT media_id FROM (${innerSubquery}) AS m_filtered`,
        innerParams
      );
      return rows.map((r) => ({ media_id: r.media_id, nm_match_count: 0 }));
    }

    const nmConditions: string[] = [];
    const outerParams: unknown[] = [];

    for (const t of nmTags) {
      const vals = t.values
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
      for (const v of vals) {
        nmConditions.push('(mft.name = ? AND mft.value = ?)');
        outerParams.push(t.name, v);
      }
    }

    const nmCaseExpr = nmConditions.length > 0
      ? `SUM(CASE WHEN ${nmConditions.join(' OR ')} THEN 1 ELSE 0 END)`
      : '0';

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

  // ========================================================================
  // Step 2: free-text vector search
  // ========================================================================

  private async step2FreeTextSearch(
    ftTags: Poc1SearchTag[],
    mediaIds: number[]
  ): Promise<Step2Row[]> {
    if (ftTags.length === 0 || mediaIds.length === 0) return [];

    // Generate embeddings for all FT tag values — one per comma-separated sub-value
    const embeddings: { name: string; embedding: number[] }[] = [];
    for (const tag of ftTags) {
      const parts = tag.values.split(',').map((v) => v.trim()).filter(Boolean);
      for (const text of parts) {
        const emb = await getEmbedding(text);
        embeddings.push({ name: tag.name, embedding: emb });
      }
    }

    if (embeddings.length === 0) return [];

    const mediaPlaceholders = mediaIds.map(() => '?').join(',');
    const ftNames = [...new Set(embeddings.map((e) => e.name))];
    const namePlaceholders = ftNames.map(() => '?').join(',');

    // Build a UNION ALL for each embedding, then aggregate
    // For each FT tag embedding we compute:
    //   confidence_level * (1 - VEC_DISTANCE_COSINE(embedding, query_vec))
    // Then SUM across all tags per media_id
    const unionParts: string[] = [];
    const unionParams: unknown[] = [];

    for (const { name, embedding } of embeddings) {
      const vecStr = `[${embedding.join(',')}]`;
      unionParts.push(`
        SELECT
          media_id,
          confidence_level * (1 - VEC_DISTANCE_COSINE(embedding, VEC_FromText('${vecStr}'))) AS tag_score
        FROM one_media_free_text_tag
        WHERE media_id IN (${mediaPlaceholders})
          AND name = ?
      `);
      unionParams.push(...mediaIds, name);
    }

    const sql = `
      SELECT
        media_id,
        SUM(tag_score) AS free_text_score
      FROM (${unionParts.join(' UNION ALL ')}) AS ft_scores
      GROUP BY media_id
      ORDER BY free_text_score DESC
    `;

    return queryMariaDb<Step2Row>(sql, unionParams);
  }

  // ========================================================================
  // Helpers
  // ========================================================================

  private async fetchMediaDetails(
    mediaIds: number[]
  ): Promise<Map<number, MediaRow>> {
    if (mediaIds.length === 0) return new Map();
    const placeholders = mediaIds.map(() => '?').join(',');
    const rows = await queryMariaDb<MediaRow>(
      `SELECT id, url, visual_qa_score FROM media WHERE id IN (${placeholders})`,
      mediaIds
    );
    const map = new Map<number, MediaRow>();
    for (const r of rows) map.set(r.id, r);
    return map;
  }

  private async fetchAllTags(
    mediaIds: number[]
  ): Promise<Map<number, Poc1ResultTag[]>> {
    if (mediaIds.length === 0) return new Map();
    const placeholders = mediaIds.map(() => '?').join(',');

    const fixedRows = await queryMariaDb<FixedTagRow>(
      `SELECT media_id, name, value, confidence_level
       FROM one_media_fixed_tag
       WHERE media_id IN (${placeholders})`,
      mediaIds
    );

    const freeRows = await queryMariaDb<FreeTextTagRow>(
      `SELECT media_id, name, value, confidence_level
       FROM one_media_free_text_tag
       WHERE media_id IN (${placeholders})`,
      mediaIds
    );

    const map = new Map<number, Poc1ResultTag[]>();

    for (const r of fixedRows) {
      if (!map.has(r.media_id)) map.set(r.media_id, []);
      map.get(r.media_id)!.push({
        name: r.name,
        type: 'FIXED',
        value: r.value,
        confidenceLevel: INT_TO_CONFIDENCE[r.confidence_level] ?? 'MEDIUM',
      });
    }

    for (const r of freeRows) {
      if (!map.has(r.media_id)) map.set(r.media_id, []);
      map.get(r.media_id)!.push({
        name: r.name,
        type: 'FREE_TEXT',
        value: r.value,
        confidenceLevel: INT_TO_CONFIDENCE[r.confidence_level] ?? 'MEDIUM',
      });
    }

    return map;
  }

  // ========================================================================
  // SEED
  // ========================================================================

  async seed(data: SeedMedia[]): Promise<void> {
    for (const item of data) {
      // Upsert into shared media table
      await queryMariaDb(
        `INSERT INTO media (url, visual_qa_score)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE visual_qa_score = VALUES(visual_qa_score)`,
        [item.mediaUrl, item.visualQaScore]
      );

      const [mediaRow] = await queryMariaDb<{ id: number }>(
        'SELECT id FROM media WHERE url = ?',
        [item.mediaUrl]
      );
      if (!mediaRow) continue;
      const mediaId = mediaRow.id;

      // Clear existing tags for idempotency
      await queryMariaDb(
        'DELETE FROM one_media_fixed_tag WHERE media_id = ?',
        [mediaId]
      );
      await queryMariaDb(
        'DELETE FROM one_media_free_text_tag WHERE media_id = ?',
        [mediaId]
      );

      for (const tag of item.tags) {
        const confInt = CONFIDENCE_TO_INT[tag.confidenceLevel] ?? 2;

        if (tag.type === 'FIXED') {
          // For FIXED tags with a `values` array, insert one row per value
          // Also insert the primary `value` if present
          const allValues = new Set<string>();
          if (tag.value) allValues.add(tag.value);
          if (tag.values?.length) {
            tag.values.forEach((v) => { if (v) allValues.add(v); });
          }

          for (const val of allValues) {
            await queryMariaDb(
              `INSERT INTO one_media_fixed_tag (media_id, name, value, confidence_level)
               VALUES (?, ?, ?, ?)`,
              [mediaId, tag.name, val, confInt]
            );
          }
        } else {
          // FREE_TEXT — generate embedding via OpenAI
          const text = tag.value || '';
          if (!text) continue;

          const embedding = await getEmbedding(text);
          const vecStr = `[${embedding.join(',')}]`;

          await queryMariaDb(
            `INSERT INTO one_media_free_text_tag (media_id, name, value, confidence_level, embedding)
             VALUES (?, ?, ?, ?, VEC_FromText(?))`,
            [mediaId, tag.name, text, confInt, vecStr]
          );
        }
      }
    }
  }
}
