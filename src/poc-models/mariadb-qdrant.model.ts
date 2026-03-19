import { v4 as uuidv4 } from 'uuid';
import { queryMariaDb } from '@/database/clients/mariadb';
import {
  getQdrantClient,
  QDRANT_COLLECTION,
  VECTOR_DIM,
} from '@/database/clients/qdrant';
import {
  MediaResult,
  PocModelType,
  SearchTag,
  SeedMedia,
  Weight,
} from '@/types';
import { IPocModel } from './base';

/** Weight -> numeric multiplier used when building query vectors */
const WEIGHT_SCORE: Record<Weight, number> = {
  [Weight.HIGH]: 3,
  [Weight.MEDIUM]: 2,
  [Weight.LOW]: 1,
};

interface MediaQdrantRow {
  id: number;
  media_url: string;
  visual_qa_score: number;
  qdrant_point_id: string;
  tag_names_json: string | null;
}

/**
 * Deterministic hash of a string into [0, VECTOR_DIM).
 * Used to map tag names/values to vector dimensions for the POC.
 */
function hashToDim(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) >>> 0;
  }
  return h % VECTOR_DIM;
}

/** Build a simple sparse-in-dense tag vector from a list of tag key-value strings */
function buildVector(tagStrings: string[]): number[] {
  const vec = new Array<number>(VECTOR_DIM).fill(0);
  for (const s of tagStrings) {
    vec[hashToDim(s)] += 1;
  }
  // L2 normalise
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

function tagStrings(tags: SeedMedia['tags'] | SearchTag[]): string[] {
  return tags.flatMap((t) => {
    const parts = [`${t.name}`];
    if ('value' in t && t.value) parts.push(`${t.name}:${t.value}`);
    if ('values' in t && t.values?.length) {
      t.values.forEach((v) => parts.push(`${t.name}:${v}`));
    }
    return parts;
  });
}

export class MariaDbQdrantModel implements IPocModel {
  readonly name = PocModelType.MARIADB_QDRANT;

  private async ensureCollection(): Promise<void> {
    const client = getQdrantClient();
    const collections = await client.getCollections();
    const exists = collections.collections.some(
      (c) => c.name === QDRANT_COLLECTION
    );
    if (!exists) {
      await client.createCollection(QDRANT_COLLECTION, {
        vectors: { size: VECTOR_DIM, distance: 'Cosine' },
      });
    }
  }

  async search(rawTags: unknown[]): Promise<MediaResult[]> {
    const tags = rawTags as SearchTag[];
    if (tags.length === 0) {
      const rows = await queryMariaDb<MediaQdrantRow>(
        'SELECT id, media_url, visual_qa_score, qdrant_point_id, tag_names_json FROM media_qdrant ORDER BY visual_qa_score DESC LIMIT 100'
      );
      return rows.map((r) => ({
        mediaUrl: r.media_url,
        score: r.visual_qa_score,
        matchedTags: r.tag_names_json ? JSON.parse(r.tag_names_json) : [],
      }));
    }

    // Build a weighted query vector
    const weightedStrings: string[] = [];
    for (const tag of tags) {
      const w = WEIGHT_SCORE[tag.weight] ?? 1;
      const strs = tagStrings([tag]);
      for (let i = 0; i < w; i++) weightedStrings.push(...strs);
    }

    const queryVector = buildVector(weightedStrings);
    const client = getQdrantClient();

    const searchResult = await client.search(QDRANT_COLLECTION, {
      vector: queryVector,
      limit: 50,
      with_payload: true,
    });

    const results: MediaResult[] = [];

    for (const hit of searchResult) {
      const payload = hit.payload as Record<string, unknown>;
      const mediaUrl = payload.media_url as string;
      const tagNames = (payload.tag_names as string[]) ?? [];

      const matchedTags = tags
        .filter((t) => tagNames.includes(t.name))
        .map((t) => t.name);

      results.push({
        mediaUrl,
        score: hit.score,
        matchedTags: [...new Set(matchedTags)],
      });
    }

    return results;
  }

  async seed(data: SeedMedia[]): Promise<void> {
    await this.ensureCollection();
    const client = getQdrantClient();

    for (const item of data) {
      const pointId = uuidv4();
      const tagNames = [...new Set(item.tags.map((t) => t.name))];

      // Upsert into MariaDB (lightweight metadata)
      await queryMariaDb(
        `INSERT INTO media_qdrant (media_url, visual_qa_score, qdrant_point_id, tag_names_json)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           visual_qa_score  = VALUES(visual_qa_score),
           qdrant_point_id  = VALUES(qdrant_point_id),
           tag_names_json   = VALUES(tag_names_json)`,
        [item.mediaUrl, item.visualQaScore, pointId, JSON.stringify(tagNames)]
      );

      // Fetch actual qdrant_point_id (may differ if row already existed)
      const [row] = await queryMariaDb<MediaQdrantRow>(
        'SELECT qdrant_point_id FROM media_qdrant WHERE media_url = ?',
        [item.mediaUrl]
      );
      const actualPointId = row?.qdrant_point_id ?? pointId;

      const vector = buildVector(tagStrings(item.tags));

      // Upsert into Qdrant
      await client.upsert(QDRANT_COLLECTION, {
        points: [
          {
            id: actualPointId,
            vector,
            payload: {
              media_url: item.mediaUrl,
              visual_qa_score: item.visualQaScore,
              tag_names: tagNames,
              tags: item.tags,
            },
          },
        ],
      });
    }
  }

  async migrate(data: SeedMedia[]): Promise<void> {
    // TODO: implement full DDL migration for Qdrant model
    await this.seed(data);
  }
}
