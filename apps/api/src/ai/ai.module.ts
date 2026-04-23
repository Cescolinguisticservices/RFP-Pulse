import { Global, Module, type Provider } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { DraftAnswerService } from './draft-answer.service';
import { createEmbeddings } from './embeddings.factory';
import { EMBEDDINGS_TOKEN, RagService } from './rag.service';

const embeddingsProvider: Provider = {
  provide: EMBEDDINGS_TOKEN,
  useFactory: () => createEmbeddings(),
};

/**
 * AI / RAG module — wires the Strategy factory for LLM providers, the
 * embeddings provider (real or deterministic mock), and the `RagService`
 * that persists + retrieves from pgvector.
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [embeddingsProvider, RagService, DraftAnswerService],
  exports: [EMBEDDINGS_TOKEN, RagService, DraftAnswerService],
})
export class AiModule {}
