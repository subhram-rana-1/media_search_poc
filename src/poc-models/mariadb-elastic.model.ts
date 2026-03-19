import { v4 as uuidv4 } from 'uuid';
import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import { queryMariaDb } from '@/database/clients/mariadb';
import { getElasticsearchClient, ES_INDEX } from '@/database/clients/elasticsearch';
import {
  MediaResult,
  PocModelType,
  SearchTag,
  SeedMedia,
  Weight,
} from '@/types';
import { IPocModel } from './base';

/** Weight -> boost value used in ES query */
const WEIGHT_BOOST: Record<Weight, number> = {
  [Weight.HIGH]: 3,
  [Weight.MEDIUM]: 2,
  [Weight.LOW]: 1,
};

interface MediaElasticRow {
  id: number;
  media_url: string;
  visual_qa_score: number;
  es_doc_id: string;
}

interface EsHitSource {
  media_url: string;
  visual_qa_score: number;
  tags: Array<{ name: string; value: string; values: string[] }>;
}

export class MariaDbElasticModel implements IPocModel {
  readonly name = PocModelType.MARIADB_ELASTIC;

  private async ensureIndex(): Promise<void> {
    const client = getElasticsearchClient();
    const exists = await client.indices.exists({ index: ES_INDEX });
    if (!exists) {
      await client.indices.create({
        index: ES_INDEX,
        mappings: {
          properties: {
            mariadb_id: { type: 'long' },
            media_url: { type: 'keyword' },
            visual_qa_score: { type: 'float' },
            tags: {
              type: 'nested',
              properties: {
                name: { type: 'keyword' },
                type: { type: 'keyword' },
                value: {
                  type: 'text',
                  fields: { keyword: { type: 'keyword' } },
                },
                values: { type: 'keyword' },
                confidence_level: { type: 'keyword' },
              },
            },
          },
        },
      });
    }
  }

  async search(rawTags: unknown[]): Promise<MediaResult[]> {
    const tags = rawTags as SearchTag[];
    const client = getElasticsearchClient();

    if (tags.length === 0) {
      const rows = await queryMariaDb<MediaElasticRow>(
        'SELECT id, media_url, visual_qa_score, es_doc_id FROM media_elastic ORDER BY visual_qa_score DESC LIMIT 100'
      );
      return rows.map((r) => ({
        mediaUrl: r.media_url,
        score: r.visual_qa_score,
        matchedTags: [],
      }));
    }

    // Build a nested bool-should query — each tag becomes a should clause
    const shouldClauses: QueryDslQueryContainer[] = tags.flatMap((tag) => {
      const boost = WEIGHT_BOOST[tag.weight] ?? 1;
      const clauses: QueryDslQueryContainer[] = [];

      // Name match always present
      clauses.push({
        nested: {
          path: 'tags',
          query: { term: { 'tags.name': { value: tag.name, boost } } },
          score_mode: 'max',
        },
      });

      // Value match
      if (tag.value) {
        clauses.push({
          nested: {
            path: 'tags',
            query: {
              bool: {
                must: [
                  { term: { 'tags.name': tag.name } },
                  {
                    multi_match: {
                      query: tag.value,
                      fields: ['tags.value', 'tags.value.keyword'],
                      boost: boost * 2,
                    },
                  },
                ],
              },
            },
            score_mode: 'max',
          },
        });
      }

      // Values array match
      if (tag.values?.length) {
        clauses.push({
          nested: {
            path: 'tags',
            query: {
              bool: {
                must: [
                  { term: { 'tags.name': tag.name } },
                  { terms: { 'tags.values': tag.values, boost: boost * 2 } },
                ],
              },
            },
            score_mode: 'max',
          },
        });
      }

      return clauses;
    });

    const esResponse = await client.search<EsHitSource>({
      index: ES_INDEX,
      size: 50,
      query: {
        bool: {
          should: shouldClauses,
          minimum_should_match: 1,
        },
      },
    });

    const results: MediaResult[] = [];

    for (const hit of esResponse.hits.hits) {
      const src = hit._source;
      if (!src) continue;

      const storedTagNames = src.tags?.map((t) => t.name) ?? [];
      const matchedTags = [
        ...new Set(
          tags
            .filter((t) => storedTagNames.includes(t.name))
            .map((t) => t.name)
        ),
      ];

      results.push({
        mediaUrl: src.media_url,
        score: hit._score ?? 0,
        matchedTags,
      });
    }

    return results;
  }

  async seed(data: SeedMedia[]): Promise<void> {
    await this.ensureIndex();
    const client = getElasticsearchClient();

    for (const item of data) {
      const docId = uuidv4();

      // Upsert into MariaDB
      await queryMariaDb(
        `INSERT INTO media_elastic (media_url, visual_qa_score, es_doc_id)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           visual_qa_score = VALUES(visual_qa_score),
           es_doc_id       = VALUES(es_doc_id)`,
        [item.mediaUrl, item.visualQaScore, docId]
      );

      // Fetch actual es_doc_id (may differ if row already existed)
      const [row] = await queryMariaDb<MediaElasticRow>(
        'SELECT id, es_doc_id FROM media_elastic WHERE media_url = ?',
        [item.mediaUrl]
      );
      const actualDocId = row?.es_doc_id ?? docId;
      const mariadbId = row?.id;

      // Upsert into Elasticsearch
      await client.index({
        index: ES_INDEX,
        id: actualDocId,
        document: {
          mariadb_id: mariadbId,
          media_url: item.mediaUrl,
          visual_qa_score: item.visualQaScore,
          tags: item.tags.map((t) => ({
            name: t.name,
            type: t.type,
            value: t.value ?? '',
            values: t.values ?? [],
            confidence_level: t.confidenceLevel,
          })),
        },
      });
    }

    await client.indices.refresh({ index: ES_INDEX });
  }
}
