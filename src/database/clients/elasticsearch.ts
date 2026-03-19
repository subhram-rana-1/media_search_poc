import { Client } from '@elastic/elasticsearch';

let client: Client | null = null;

export function getElasticsearchClient(): Client {
  if (!client) {
    client = new Client({
      node: process.env.ELASTICSEARCH_URL ?? 'http://localhost:9200',
      auth: process.env.ELASTICSEARCH_API_KEY
        ? { apiKey: process.env.ELASTICSEARCH_API_KEY }
        : undefined,
    });
  }
  return client;
}

export const ES_INDEX = process.env.ELASTICSEARCH_INDEX ?? 'media_tags';
