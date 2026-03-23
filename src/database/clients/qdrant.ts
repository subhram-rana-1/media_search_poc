import { QdrantClient } from '@qdrant/js-client-rest';

let client: QdrantClient | null = null;

export function getQdrantClient(): QdrantClient {
  if (!client) {
    client = new QdrantClient({
      url: process.env.QDRANT_URL ?? 'http://localhost:6333',
      apiKey: process.env.QDRANT_API_KEY,
    });
  }
  return client;
}

export const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION ?? 'media';

export const VECTOR_DIM = 1536;
