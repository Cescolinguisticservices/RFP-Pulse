import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { Injectable } from '@nestjs/common';

import { LLMProvider as LLMProviderEnum } from '@rfp-pulse/db';

import {
  createChatModel,
  providerNameFromEnum,
  type LLMFactoryOptions,
  type LLMProviderName,
} from './llm.factory';
import { RagService, type RetrievedEntry } from './rag.service';

export type ChatModelBuilder = (opts: LLMFactoryOptions) => BaseChatModel;

export interface DraftAnswerInput {
  tenantId: string;
  question: string;
  provider: LLMProviderName | LLMProviderEnum;
  /** Extra model options (model id, temperature, apiKey). */
  modelOverride?: Omit<LLMFactoryOptions, 'provider'>;
  topK?: number;
}

export interface DraftAnswerResult {
  draft: string;
  retrieved: RetrievedEntry[];
  provider: LLMProviderName;
}

/**
 * End-to-end RAG pipeline: pulls the top-K most relevant KB entries for a
 * question via {@link RagService} and asks the selected LLM (via the
 * Strategy factory) to draft a response grounded in that context.
 *
 * The chat-model builder is injected via a setter so tests can substitute a
 * fake without reaching for Jest module mocks.
 */
@Injectable()
export class DraftAnswerService {
  private buildChatModel: ChatModelBuilder = createChatModel;

  constructor(private readonly rag: RagService) {}

  /** Test-only seam: override the chat-model factory used by {@link draft}. */
  setChatModelBuilder(builder: ChatModelBuilder): void {
    this.buildChatModel = builder;
  }

  async draft(input: DraftAnswerInput): Promise<DraftAnswerResult> {
    const providerName = normalizeProvider(input.provider);
    const retrieved = await this.rag.retrieveTopK(input.tenantId, input.question, input.topK ?? 3);

    const chat = this.buildChatModel({
      ...(input.modelOverride ?? {}),
      provider: providerName,
    });
    const response = await chat.invoke([
      new SystemMessage(
        'You are an expert RFP response writer. Use the supplied knowledge base excerpts to draft a concise, factual answer. If the excerpts do not cover the question, say so explicitly.',
      ),
      new HumanMessage(buildPrompt(input.question, retrieved)),
    ]);

    return {
      draft: messageContentToString(response.content),
      retrieved,
      provider: providerName,
    };
  }
}

function normalizeProvider(p: LLMProviderName | LLMProviderEnum): LLMProviderName {
  if (typeof p === 'string' && ['openai', 'gemini', 'claude', 'llama'].includes(p)) {
    return p as LLMProviderName;
  }
  return providerNameFromEnum(p as LLMProviderEnum);
}

function buildPrompt(question: string, retrieved: RetrievedEntry[]): string {
  if (retrieved.length === 0) {
    return `RFP question:\n${question}\n\n(no knowledge base excerpts were available)`;
  }
  const context = retrieved.map((r, i) => `[${i + 1}] (${r.title}) ${r.content}`).join('\n\n');
  return `Knowledge base excerpts:\n${context}\n\nRFP question:\n${question}\n\nDraft a response grounded in the excerpts above.`;
}

function messageContentToString(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c) =>
        typeof c === 'string'
          ? c
          : typeof c === 'object' && c !== null && 'text' in c
            ? String((c as { text: unknown }).text)
            : '',
      )
      .join('');
  }
  return '';
}
