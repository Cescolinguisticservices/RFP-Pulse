import { Embeddings, type EmbeddingsParams } from '@langchain/core/embeddings';

/**
 * Deterministic, dependency-free embeddings used in tests and when no
 * `OPENAI_API_KEY` is configured. The vector is a pure function of the input
 * string, so embedding the same text twice returns identical vectors and
 * cosine similarity of 1.0.
 *
 * Not semantically meaningful — two similar English sentences will produce
 * wildly different vectors. Useful only for plumbing / round-trip tests.
 */
export class DeterministicMockEmbeddings extends Embeddings {
  constructor(
    private readonly dim = 1536,
    params: EmbeddingsParams = {},
  ) {
    super(params);
  }

  async embedQuery(text: string): Promise<number[]> {
    return this.hashToVector(text);
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.hashToVector(t));
  }

  private hashToVector(input: string): number[] {
    // FNV-1a over the UTF-16 code units to seed an xorshift32 PRNG.
    let seed = 2166136261 >>> 0;
    for (let i = 0; i < input.length; i++) {
      seed = Math.imul(seed ^ input.charCodeAt(i), 16777619) >>> 0;
    }
    let x = seed === 0 ? 1 : seed;
    const v = new Array<number>(this.dim);
    for (let i = 0; i < this.dim; i++) {
      x ^= x << 13;
      x >>>= 0;
      x ^= x >>> 17;
      x ^= x << 5;
      x >>>= 0;
      v[i] = (x / 0xffffffff) * 2 - 1;
    }
    // L2-normalise so cosine similarity ranges cleanly in [-1, 1].
    let sumSq = 0;
    for (const y of v) sumSq += y * y;
    const norm = Math.sqrt(sumSq) || 1;
    for (let i = 0; i < this.dim; i++) v[i] /= norm;
    return v;
  }
}
