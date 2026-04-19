import type { Embeddings } from '@langchain/core/embeddings';
import { OpenAIEmbeddings } from '@langchain/openai';

import { DeterministicMockEmbeddings } from './mock-embeddings';

export interface EmbeddingFactoryOptions {
  model?: string;
  apiKey?: string;
}

/**
 * Returns an `Embeddings` instance suitable for persisting 1536-dim vectors
 * into the `knowledge_base_entries.embedding` pgvector column.
 *
 * - If `OPENAI_API_KEY` (or an explicit `apiKey`) is present, uses
 *   `text-embedding-3-small` (1536 dims).
 * - Otherwise falls back to `DeterministicMockEmbeddings` so the pipeline
 *   runs in dev and CI without requiring a real API key. Not suitable for
 *   production-quality semantic search, but correct dim + stable output.
 */
export function createEmbeddings(opts: EmbeddingFactoryOptions = {}): Embeddings {
  const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY;
  if (apiKey && apiKey.length > 0 && apiKey !== 'sk-placeholder') {
    return new OpenAIEmbeddings({
      model: opts.model ?? 'text-embedding-3-small',
      apiKey,
    });
  }
  return new DeterministicMockEmbeddings(1536);
}
