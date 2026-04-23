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

export type ChatModelBuilder = (opts: LLMFactoryOptions) => BaseChatModel;

export interface ExtractQuestionsInput {
  extractedText: string;
  provider: LLMProviderName | LLMProviderEnum;
  /** Hard cap on number of questions returned. Defaults to 50. */
  max?: number;
}

export interface ExtractQuestionsResult {
  questions: string[];
  provider: LLMProviderName;
}

const SYSTEM_PROMPT = `You are an expert RFP analyst. Given the full text of an RFP document, extract every distinct question, requirement, or request for information from the RFP that the responding vendor must answer.

Rules:
- Return ONLY a JSON array of strings. No prose, no markdown code fences.
- Each array element is one concise question, rewritten in plain English if needed.
- Omit boilerplate, table-of-contents entries, and instructions that are not questions.
- De-duplicate. Preserve the order in which topics appear in the source.
- Hard cap: at most {MAX} entries.`;

@Injectable()
export class ExtractQuestionsService {
  private buildChatModel: ChatModelBuilder = createChatModel;

  /** Test seam — swap in a fake chat model. */
  setChatModelBuilder(builder: ChatModelBuilder): void {
    this.buildChatModel = builder;
  }

  async extract(input: ExtractQuestionsInput): Promise<ExtractQuestionsResult> {
    const providerName = normalizeProvider(input.provider);
    const max = input.max ?? 50;
    const chat = this.buildChatModel({ provider: providerName });

    // Cap the text we send to stay within typical context windows.
    const text = truncateForPrompt(input.extractedText);

    const response = await chat.invoke([
      new SystemMessage(SYSTEM_PROMPT.replace('{MAX}', String(max))),
      new HumanMessage(`RFP document text:\n\n${text}`),
    ]);

    const raw = messageContentToString(response.content);
    const questions = dedupe(parseQuestionsJson(raw)).slice(0, max);
    return { questions, provider: providerName };
  }
}

function normalizeProvider(p: LLMProviderName | LLMProviderEnum): LLMProviderName {
  if (typeof p === 'string' && ['openai', 'gemini', 'claude', 'llama'].includes(p)) {
    return p as LLMProviderName;
  }
  return providerNameFromEnum(p as LLMProviderEnum);
}

function truncateForPrompt(text: string): string {
  const MAX_CHARS = 60000;
  if (text.length <= MAX_CHARS) return text;
  return `${text.slice(0, MAX_CHARS)}\n\n[…text truncated at ${MAX_CHARS} characters…]`;
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

/**
 * Parses the LLM response into a list of question strings. Accepts:
 *   - raw JSON array
 *   - JSON wrapped in ```json fences
 *   - numbered / bulleted list fallback
 */
function parseQuestionsJson(raw: string): string[] {
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  try {
    const parsed: unknown = JSON.parse(stripped);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((v): v is string => typeof v === 'string')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
  } catch {
    // fall through to bullet/numbered parsing
  }
  return stripped
    .split(/\r?\n+/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())
    .filter((line) => line.length > 3);
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
