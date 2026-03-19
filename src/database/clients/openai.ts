import OpenAI from 'openai';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return client;
}

const MODEL = 'text-embedding-3-small';

/**
 * Generate an embedding for a single text string.
 * Returns a 1536-dimensional float array.
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const res = await getClient().embeddings.create({
    model: MODEL,
    input: text,
  });
  return res.data[0].embedding;
}

/**
 * Generate embeddings for multiple texts in a single API call.
 * Returns one 1536-dimensional float array per input text.
 */
export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const res = await getClient().embeddings.create({
    model: MODEL,
    input: texts,
  });
  return res.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}
