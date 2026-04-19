import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { PromptTemplate } from '@langchain/core/prompts';
import { Injectable } from '@nestjs/common';

import { LLMProvider as LLMProviderEnum } from '@rfp-pulse/db';

import {
  createChatModel,
  providerNameFromEnum,
  type LLMFactoryOptions,
  type LLMProviderName,
} from '../ai/llm.factory';

export type ChatModelBuilder = (opts: LLMFactoryOptions) => BaseChatModel;

export interface FoiaAnalysis {
  pricingModel: string;
  technicalStrategies: string;
  winThemes: string;
}

/**
 * LangChain prompt template for FOIA analysis, per master prompt step 4.23:
 * "Extract pricing models, technical strategies, and win themes from the
 *  following competitor proposal: {text}".
 */
export const FOIA_PROMPT = PromptTemplate.fromTemplate(
  `You are a competitive-intelligence analyst. Extract pricing models, technical strategies, and win themes from the following competitor proposal.

Competitor proposal:
{text}

Respond with strict JSON matching this TypeScript type (no markdown, no prose):
{{
  "pricingModel": string,
  "technicalStrategies": string,
  "winThemes": string
}}`,
);

/**
 * Analyses a parsed FOIA / competitor document and returns the structured
 * intel fields persisted to `CompetitorIntel`. Exposes a test seam so specs
 * can substitute a fake chat model without hitting real provider APIs.
 */
@Injectable()
export class FoiaAnalyzerService {
  private buildChatModel: ChatModelBuilder = createChatModel;

  setChatModelBuilder(builder: ChatModelBuilder): void {
    this.buildChatModel = builder;
  }

  async analyze(params: {
    text: string;
    provider: LLMProviderName | LLMProviderEnum;
    modelOverride?: Omit<LLMFactoryOptions, 'provider'>;
  }): Promise<FoiaAnalysis> {
    const provider = normaliseProvider(params.provider);
    const chat = this.buildChatModel({ ...(params.modelOverride ?? {}), provider });
    const prompt = await FOIA_PROMPT.format({ text: params.text });
    const response = await chat.invoke([
      new SystemMessage(
        'You extract structured competitive intelligence from RFP / FOIA documents. Answer only with the JSON object requested.',
      ),
      new HumanMessage(prompt),
    ]);
    return parseAnalysis(toStringContent(response.content));
  }
}

function normaliseProvider(p: LLMProviderName | LLMProviderEnum): LLMProviderName {
  if (typeof p === 'string' && ['openai', 'gemini', 'claude', 'llama'].includes(p)) {
    return p as LLMProviderName;
  }
  return providerNameFromEnum(p as LLMProviderEnum);
}

function toStringContent(content: unknown): string {
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

function parseAnalysis(raw: string): FoiaAnalysis {
  // Tolerate models that wrap JSON in ``` fences.
  const stripped = raw
    .replace(/^\s*```(?:json)?/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  const obj: unknown = safeJsonParse(stripped);
  if (!obj || typeof obj !== 'object') {
    throw new Error(`FOIA analyzer returned non-JSON output: ${raw.slice(0, 200)}`);
  }
  const o = obj as Record<string, unknown>;
  return {
    pricingModel: String(o.pricingModel ?? ''),
    technicalStrategies: String(o.technicalStrategies ?? ''),
    winThemes: String(o.winThemes ?? ''),
  };
}

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    // Attempt to locate the first JSON object within the text.
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(s.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}
