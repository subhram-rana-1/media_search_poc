import { queryMariaDb, withConnection } from '@/database/clients/mariadb';
import { getEmbedding, getEmbeddings } from '@/database/clients/openai';
import {
  Poc1MediaResult,
  Poc1SearchTag,
  PocModelType,
  SeedMedia,
  ConfidenceLevel,
} from '@/types';
import { IPocModel } from './base';
import { fetchAllTags, INT_TO_CONFIDENCE } from './tag-helpers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

const CONFIDENCE_TO_INT: Record<string, number> = {
  [ConfidenceLevel.LOW]: 1,
  [ConfidenceLevel.MEDIUM]: 2,
  [ConfidenceLevel.HIGH]: 3,
};

const RANK_WEIGHT = 0.5;
const TOP_N = 50;

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
    const ranked: { mediaId: number; finalRank: number }[] = [];

    for (const mediaId of step1MediaIds) {
      const rank1 = sortOrder1.get(mediaId) ?? totalCount;
      const rank2 = sortOrder2.get(mediaId) ?? totalCount;
      const finalRank = RANK_WEIGHT * rank1 + RANK_WEIGHT * rank2;
      ranked.push({ mediaId, finalRank });
    }

    // Fetch media details for sorting tiebreaker
    const mediaMap = await this.fetchMediaDetails(step1MediaIds);

    ranked.sort((a, b) => {
      if (a.finalRank !== b.finalRank) return a.finalRank - b.finalRank;
      const vqaA = mediaMap.get(a.mediaId)?.visual_qa_score ?? 0;
      const vqaB = mediaMap.get(b.mediaId)?.visual_qa_score ?? 0;
      return vqaB - vqaA; // higher visual_qa_score wins tiebreak
    });

    const top = ranked.slice(0, TOP_N);
    const topMediaIds = top.map((r) => r.mediaId);

    // Fetch all tags for the top results
    const tagsByMedia = await fetchAllTags(topMediaIds);

    return top
      .filter((r) => Number(mediaMap.get(r.mediaId)?.visual_qa_score ?? 0) >= minQaScore)
      .map((r) => {
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

  // ========================================================================
  // SEED
  // ========================================================================

  async seed(data: SeedMedia[]): Promise<void> {
    if (data.length === 0) return;

    // ── Step 1: Batch INSERT all media rows (2 000 rows / batch) ──────────────
    const MEDIA_BATCH = 2_000;
    for (const chunk of chunkArray(data, MEDIA_BATCH)) {
      const mediaPlaceholders = chunk.map(() => '(?, ?)').join(', ');
      const mediaValues = chunk.flatMap((item) => [item.mediaUrl, item.visualQaScore]);
      await queryMariaDb(
        `INSERT INTO media (url, visual_qa_score) VALUES ${mediaPlaceholders}`,
        mediaValues
      );
    }

    // ── Step 2: Fetch all newly inserted media ids in batches of 5 000 ───────
    const urlList = data.map((item) => item.mediaUrl);
    const urlToId = new Map<string, number>();
    const URL_BATCH = 5_000;
    for (const chunk of chunkArray(urlList, URL_BATCH)) {
      const urlPlaceholders = chunk.map(() => '?').join(', ');
      const mediaRows = await queryMariaDb<{ id: number; url: string }>(
        `SELECT id, url FROM media WHERE url IN (${urlPlaceholders})`,
        chunk
      );
      for (const r of mediaRows) urlToId.set(r.url, r.id);
    }

    // ── Step 3: Collect and batch INSERT all fixed tag rows ──────────────────
    const fixedRows: [number, string, string, number][] = [];
    for (const item of data) {
      const mediaId = urlToId.get(item.mediaUrl);
      if (mediaId === undefined) continue;
      for (const tag of item.tags) {
        if (tag.type !== 'FIXED') continue;
        const confInt = CONFIDENCE_TO_INT[tag.confidenceLevel] ?? 2;
        const uniqueVals = [...new Set(tag.values.filter(Boolean))];
        for (const val of uniqueVals) {
          fixedRows.push([mediaId, tag.name, val, confInt]);
        }
      }
    }

    if (fixedRows.length > 0) {
      const FIXED_BATCH = 2_000;
      for (const chunk of chunkArray(fixedRows, FIXED_BATCH)) {
        const fixedPlaceholders = chunk.map(() => '(?, ?, ?, ?)').join(', ');
        const fixedValues = chunk.flat();
        await queryMariaDb(
          `INSERT INTO one_media_fixed_tag (media_id, name, value, confidence_level) VALUES ${fixedPlaceholders}`,
          fixedValues
        );
      }
    }

    // ── Step 4: Collect all FREE_TEXT tag items ───────────────────────────────
    const freeTextItems: { mediaId: number; name: string; text: string; confInt: number }[] = [];
    for (const item of data) {
      const mediaId = urlToId.get(item.mediaUrl);
      if (mediaId === undefined) continue;
      for (const tag of item.tags) {
        if (tag.type !== 'FREE_TEXT') continue;
        const text = tag.value || '';
        if (!text) continue;
        const confInt = CONFIDENCE_TO_INT[tag.confidenceLevel] ?? 2;
        freeTextItems.push({ mediaId, name: tag.name, text, confInt });
      }
    }

    if (freeTextItems.length === 0) return;

    // ── Step 5: Fetch all embeddings in chunks of 500 ────────────────────────
    const CHUNK_SIZE = 500;
    const texts = freeTextItems.map((ft) => ft.text);
    const allEmbeddings: number[][] = [];
    for (let i = 0; i < texts.length; i += CHUNK_SIZE) {
      const chunk = await getEmbeddings(texts.slice(i, i + CHUNK_SIZE));
      allEmbeddings.push(...chunk);
    }

    // ── Step 6: Batch INSERT free-text tag rows in tiny batches (50 rows × ~14 KB embedding ≈ 700 KB/batch) ──
    const FREE_TEXT_BATCH = 50;
    for (let start = 0; start < freeTextItems.length; start += FREE_TEXT_BATCH) {
      const chunkItems = freeTextItems.slice(start, start + FREE_TEXT_BATCH);
      const freeTextPlaceholders = chunkItems.map(() => '(?, ?, ?, ?, VEC_FromText(?))').join(', ');
      const freeTextValues = chunkItems.flatMap((ft, idx) => [
        ft.mediaId,
        ft.name,
        ft.text,
        ft.confInt,
        `[${allEmbeddings[start + idx].join(',')}]`,
      ]);
      await queryMariaDb(
        `INSERT INTO one_media_free_text_tag (media_id, name, value, confidence_level, embedding) VALUES ${freeTextPlaceholders}`,
        freeTextValues
      );
    }
  }

  // ========================================================================
  // MIGRATE  (drop → create → seed)
  // ========================================================================

  async migrate(data: SeedMedia[]): Promise<void> {
    // Run all DDL on a single connection so session settings (FK checks) and
    // table visibility are consistent across every statement.
    await withConnection(async (conn) => {
      await conn.query('SET FOREIGN_KEY_CHECKS = 0');

      await conn.query('DROP TABLE IF EXISTS one_media_free_text_tag');
      await conn.query('DROP TABLE IF EXISTS one_media_fixed_tag');
      await conn.query('DROP TABLE IF EXISTS media');

      await conn.query('SET FOREIGN_KEY_CHECKS = 1');

      await conn.query(`
        CREATE TABLE media (
          id              INT(11)        NOT NULL AUTO_INCREMENT,
          url             VARCHAR(512)   NOT NULL,
          visual_qa_score DECIMAL(5,2)   NOT NULL DEFAULT 0,
          PRIMARY KEY (id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await conn.query(`
        CREATE TABLE one_media_fixed_tag (
          id               INT(11)       NOT NULL AUTO_INCREMENT,
          media_id         INT(11)       NOT NULL,
          name             VARCHAR(256)  NOT NULL,
          value            VARCHAR(256)  NOT NULL,
          confidence_level TINYINT(1)    NOT NULL,
          PRIMARY KEY (id),
          INDEX idx_name_value_media (name, value, media_id),
          INDEX idx_media_id (media_id),
          FOREIGN KEY (media_id) REFERENCES media(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await conn.query(`
        CREATE TABLE one_media_free_text_tag (
          id               INT(11)       NOT NULL AUTO_INCREMENT,
          media_id         INT(11)       NOT NULL,
          name             VARCHAR(256)  NOT NULL,
          value            TEXT          NOT NULL,
          confidence_level TINYINT(1)    NOT NULL,
          embedding        VECTOR(1536)  NOT NULL,
          PRIMARY KEY (id),
          VECTOR INDEX idx_embedding (embedding),
          INDEX idx_media_id (media_id),
          FOREIGN KEY (media_id) REFERENCES media(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    });

    // Seed runs after the connection is released; tables are globally visible.
    await this.seed(data);
  }
}
