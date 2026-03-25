import { queryMariaDb } from '@/database/clients/mariadb';
import { Poc1ResultTag } from '@/types';

export const INT_TO_CONFIDENCE: Record<number, string> = {
  1: 'LOW',
  2: 'MEDIUM',
  3: 'HIGH',
};

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

export async function fetchAllTags(
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
