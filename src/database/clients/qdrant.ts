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

export const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION ?? 'media_tags';

/**
 * Vector dimension for tag embeddings.
 * For the POC we use a simple bag-of-words style sparse vector mapped to a
 * fixed-size dense vector.  Change this constant if you swap in a real
 * embedding model.
 */
export const VECTOR_DIM = 128;
