import { queryMariaDb } from '@/database/clients/mariadb';
import {
  MediaResult,
  PocModelType,
  SearchTag,
  SeedMedia,
  Weight,
} from '@/types';
import { IPocModel } from './base';

/** Weight -> numeric multiplier used in relevance scoring */
const WEIGHT_SCORE: Record<Weight, number> = {
  [Weight.HIGH]: 3,
  [Weight.MEDIUM]: 2,
  [Weight.LOW]: 1,
};

interface MediaRow {
  id: number;
  media_url: string;
  visual_qa_score: number;
}

interface TagRow {
  media_id: number;
  tag_name: string;
  tag_value: string;
  tag_values_json: string | null;
}

export class MariaDbOnlyModel implements IPocModel {
  readonly name = PocModelType.MARIADB_ONLY;

  async search(tags: SearchTag[]): Promise<MediaResult[]> {
    if (tags.length === 0) {
      // Return all media when no tags are provided
      const rows = await queryMariaDb<MediaRow>(
        'SELECT id, media_url, visual_qa_score FROM media ORDER BY visual_qa_score DESC LIMIT 100'
      );
      return rows.map((r) => ({
        mediaUrl: r.media_url,
        score: r.visual_qa_score,
        matchedTags: [],
      }));
    }

    // Fetch all media that have at least one matching tag
    const tagNames = tags.map((t) => t.name);
    const placeholders = tagNames.map(() => '?').join(',');

    const mediaRows = await queryMariaDb<MediaRow>(
      `SELECT DISTINCT m.id, m.media_url, m.visual_qa_score
       FROM media m
       JOIN media_tags mt ON mt.media_id = m.id
       WHERE mt.tag_name IN (${placeholders})`,
      tagNames
    );

    if (mediaRows.length === 0) return [];

    const mediaIds = mediaRows.map((r) => r.id);
    const idPlaceholders = mediaIds.map(() => '?').join(',');

    const tagRows = await queryMariaDb<TagRow>(
      `SELECT media_id, tag_name, tag_value, tag_values_json
       FROM media_tags
       WHERE media_id IN (${idPlaceholders}) AND tag_name IN (${placeholders})`,
      [...mediaIds, ...tagNames]
    );

    // Build a lookup: mediaId -> tag rows
    const tagsByMedia = new Map<number, TagRow[]>();
    for (const tr of tagRows) {
      if (!tagsByMedia.has(tr.media_id)) tagsByMedia.set(tr.media_id, []);
      tagsByMedia.get(tr.media_id)!.push(tr);
    }

    const results: MediaResult[] = [];

    for (const media of mediaRows) {
      const dbTags = tagsByMedia.get(media.id) ?? [];
      let score = 0;
      const matchedTags: string[] = [];

      for (const searchTag of tags) {
        const weight = WEIGHT_SCORE[searchTag.weight] ?? 1;
        const matched = dbTags.some((dt) => {
          if (dt.tag_name !== searchTag.name) return false;

          // Value match
          if (searchTag.value && dt.tag_value === searchTag.value) return true;

          // Values array match — check if any search value overlaps stored values
          if (searchTag.values?.length) {
            const storedValues: string[] = dt.tag_values_json
              ? JSON.parse(dt.tag_values_json)
              : [];
            return searchTag.values.some((v) => storedValues.includes(v));
          }

          // Tag name present (no value constraint)
          return true;
        });

        if (matched) {
          score += weight;
          matchedTags.push(searchTag.name);
        }
      }

      if (score > 0) {
        results.push({
          mediaUrl: media.media_url,
          score: score + media.visual_qa_score * 0.1,
          matchedTags: [...new Set(matchedTags)],
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results;
  }

  async seed(data: SeedMedia[]): Promise<void> {
    for (const item of data) {
      // Upsert media row
      await queryMariaDb(
        `INSERT INTO media (media_url, visual_qa_score)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE visual_qa_score = VALUES(visual_qa_score)`,
        [item.mediaUrl, item.visualQaScore]
      );

      // Fetch the inserted/existing id
      const [mediaRow] = await queryMariaDb<MediaRow>(
        'SELECT id FROM media WHERE media_url = ?',
        [item.mediaUrl]
      );

      if (!mediaRow) continue;

      // Delete existing tags then re-insert for idempotency
      await queryMariaDb('DELETE FROM media_tags WHERE media_id = ?', [
        mediaRow.id,
      ]);

      for (const tag of item.tags) {
        await queryMariaDb(
          `INSERT INTO media_tags
             (media_id, tag_name, tag_type, tag_value, tag_values_json, confidence_level)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            mediaRow.id,
            tag.name,
            tag.type,
            tag.value ?? '',
            tag.values ? JSON.stringify(tag.values) : null,
            tag.confidenceLevel,
          ]
        );
      }
    }
  }
}
