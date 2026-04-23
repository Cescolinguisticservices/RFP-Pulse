import { ChatAnthropic } from '@langchain/anthropic';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatGroq } from '@langchain/groq';
import { ChatOpenAI } from '@langchain/openai';

import { LLMProvider as LLMProviderEnum } from '@rfp-pulse/db';

import { DeterministicMockChatModel } from './mock-chat-model';

/**
 * Canonical, lowercase string name for an LLM provider. Accepted by the
 * factory so callers can forward values straight from config/UI forms without
 * importing the Prisma enum.
 */
export type LLMProviderName = 'openai' | 'gemini' | 'claude' | 'llama';

export interface LLMFactoryOptions {
  provider: LLMProviderName;
  /** Provider-specific model id; sensible default used if omitted. */
  model?: string;
  /** 0.0–1.0 sampling temperature. Defaults to 0.2 for draft-response stability. */
  temperature?: number;
  /** Overrides the env-var lookup. Primarily used in tests. */
  apiKey?: string;
}

const DEFAULT_MODELS: Record<LLMProviderName, string> = {
  openai: 'gpt-4o-mini',
  gemini: 'gemini-1.5-flash',
  claude: 'claude-3-5-haiku-latest',
  llama: 'llama-3.1-70b-versatile',
};

/**
 * Strategy factory for LangChain chat models.
 *
 * Given a provider name, returns a fully-configured `BaseChatModel` instance
 * that can be handed to any LangChain chain/prompt pipeline. Callers don't
 * need to know which SDK backs the provider.
 */
export function createChatModel(opts: LLMFactoryOptions): BaseChatModel {
  const apiKey = opts.apiKey ?? apiKeyFromEnv(opts.provider);
  const temperature = opts.temperature ?? 0.2;
  const model = opts.model ?? DEFAULT_MODELS[opts.provider];

  if (!apiKey) {
    return new DeterministicMockChatModel(opts.provider);
  }

  switch (opts.provider) {
    case 'openai':
      return new ChatOpenAI({ model, temperature, apiKey });
    case 'gemini':
      return new ChatGoogleGenerativeAI({ model, temperature, apiKey });
    case 'claude':
      return new ChatAnthropic({ model, temperature, apiKey });
    case 'llama':
      return new ChatGroq({ model, temperature, apiKey });
    default: {
      const exhaustive: never = opts.provider;
      throw new Error(`Unknown LLM provider: ${String(exhaustive)}`);
    }
  }
}

/** Maps the Prisma `LLMProvider` enum to the factory's string names. */
export function providerNameFromEnum(p: LLMProviderEnum): LLMProviderName {
  switch (p) {
    case LLMProviderEnum.OPENAI:
      return 'openai';
    case LLMProviderEnum.GEMINI:
      return 'gemini';
    case LLMProviderEnum.CLAUDE:
      return 'claude';
    case LLMProviderEnum.LLAMA:
      return 'llama';
    default: {
      const exhaustive: never = p;
      throw new Error(`Unknown LLMProvider enum value: ${String(exhaustive)}`);
    }
  }
}

function apiKeyFromEnv(provider: LLMProviderName): string | undefined {
  switch (provider) {
    case 'openai':
      return process.env.OPENAI_API_KEY;
    case 'gemini':
      return process.env.GOOGLE_API_KEY;
    case 'claude':
      return process.env.ANTHROPIC_API_KEY;
    case 'llama':
      return process.env.GROQ_API_KEY;
  }
}
