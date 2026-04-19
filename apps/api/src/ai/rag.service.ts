import { randomUUID } from 'node:crypto';

import type { Embeddings } from '@langchain/core/embeddings';
import { Inject, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

/** DI token for the active `Embeddings` implementation. */
export const EMBEDDINGS_TOKEN = Symbol('RFP_PULSE_EMBEDDINGS');

export interface IndexEntryInput {
  tenantId: string;
  title: string;
  content: string;
  source?: string | null;
}

export interface RetrievedEntry {
  id: string;
  title: string;
  content: string;
  source: string | null;
  /** Cosine similarity in [-1, 1]; 1.0 == identical. */
  similarity: number;
}

/**
 * Persists embeddings for `KnowledgeBaseEntry` rows and retrieves the top-K
 * nearest neighbours for a given query using pgvector's cosine distance
 * operator (`<=>`).
 *
 * Uses raw SQL because Prisma marks the `embedding` column as `Unsupported`
 * (pgvector has no first-class Prisma type).
 */
@Injectable()
export class RagService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMBEDDINGS_TOKEN) private readonly embeddings: Embeddings,
  ) {}

  async indexEntry(input: IndexEntryInput): Promise<string> {
    const id = randomUUID();
    const vector = await this.embeddings.embedQuery(
      joinTitleAndContent(input.title, input.content),
    );
    const literal = toVectorLiteral(vector);

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO knowledge_base_entries
         (id, "tenantId", title, content, source, embedding, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6::vector, NOW(), NOW())`,
      id,
      input.tenantId,
      input.title,
      input.content,
      input.source ?? null,
      literal,
    );

    return id;
  }

  async retrieveTopK(tenantId: string, query: string, k = 3): Promise<RetrievedEntry[]> {
    const vector = await this.embeddings.embedQuery(query);
    const literal = toVectorLiteral(vector);

    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        title: string;
        content: string;
        source: string | null;
        similarity: number | string;
      }>
    >(
      `SELECT id, title, content, source,
              1 - (embedding <=> $1::vector) AS similarity
         FROM knowledge_base_entries
        WHERE "tenantId" = $2 AND embedding IS NOT NULL
        ORDER BY embedding <=> $1::vector
        LIMIT $3`,
      literal,
      tenantId,
      k,
    );

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      content: r.content,
      source: r.source,
      similarity: typeof r.similarity === 'string' ? Number(r.similarity) : r.similarity,
    }));
  }
}

function joinTitleAndContent(title: string, content: string): string {
  return `${title}\n\n${content}`;
}

function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}
