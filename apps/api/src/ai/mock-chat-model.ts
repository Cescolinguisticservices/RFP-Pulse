import {
  SimpleChatModel,
  type BaseChatModelParams,
} from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';

/**
 * Deterministic chat-model fallback used when no provider API key is
 * configured (local dev / CI). Produces a short, grounded-looking answer
 * derived from the supplied messages so the Draft Response flow is
 * exercisable end-to-end without real LLM credentials.
 *
 * Not suitable for production — real tenants should configure a real
 * provider key so the Strategy factory instantiates a live model.
 */
export class DeterministicMockChatModel extends SimpleChatModel {
  constructor(
    private readonly providerLabel: string,
    params: BaseChatModelParams = {},
  ) {
    super(params);
  }

  _llmType(): string {
    return `mock-${this.providerLabel}`;
  }

  async _call(messages: BaseMessage[]): Promise<string> {
    const human = messages[messages.length - 1];
    const prompt = typeof human?.content === 'string' ? human.content : '';

    if (isFoiaPrompt(prompt)) {
      return buildFoiaMockJson(prompt, this.providerLabel);
    }

    if (isExtractQuestionsPrompt(messages)) {
      return buildExtractQuestionsMockJson(prompt);
    }

    const question = extractQuestion(prompt);
    const excerpts = extractExcerpts(prompt);

    const lines: string[] = [`Draft response (mock ${this.providerLabel}): ${question}`, ''];
    if (excerpts.length > 0) {
      lines.push('Grounded in the following knowledge-base excerpts:');
      for (const e of excerpts) lines.push(`• ${e}`);
    } else {
      lines.push(
        'No relevant knowledge-base excerpts were retrieved; this is a stub draft for dev/CI.',
      );
    }
    lines.push('');
    lines.push(
      'Replace by configuring a real provider API key (e.g. OPENAI_API_KEY) and clicking Draft Response again.',
    );
    return lines.join('\n');
  }
}

function extractQuestion(prompt: string): string {
  const match = prompt.match(/RFP question:\s*\n?([^\n]+)/);
  return (match?.[1] ?? prompt.slice(0, 160)).trim();
}

function extractExcerpts(prompt: string): string[] {
  const header = 'Knowledge base excerpts:';
  const idx = prompt.indexOf(header);
  if (idx === -1) return [];
  const block = prompt.slice(idx + header.length).split('\n\nRFP question:')[0];
  return block
    .split('\n\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 3);
}

function isFoiaPrompt(prompt: string): boolean {
  return (
    prompt.includes('pricingModel') &&
    prompt.includes('technicalStrategies') &&
    prompt.includes('winThemes')
  );
}

function buildFoiaMockJson(prompt: string, providerLabel: string): string {
  const source = extractFoiaSource(prompt);
  const preview = source.replace(/\s+/g, ' ').slice(0, 180);
  const payload = {
    pricingModel: `[mock ${providerLabel}] Pricing excerpt: ${preview}`,
    technicalStrategies: `[mock ${providerLabel}] Technical strategies extracted from the document (stub). Configure a real provider API key to get a real analysis.`,
    winThemes: `[mock ${providerLabel}] Win themes extracted from the document (stub). Configure a real provider API key to get a real analysis.`,
  };
  return JSON.stringify(payload);
}

function extractFoiaSource(prompt: string): string {
  const header = 'Competitor proposal:';
  const idx = prompt.indexOf(header);
  if (idx === -1) return prompt.slice(0, 200);
  const after = prompt.slice(idx + header.length);
  const end = after.indexOf('\n\nRespond with');
  return (end === -1 ? after : after.slice(0, end)).trim();
}

function isExtractQuestionsPrompt(messages: BaseMessage[]): boolean {
  const system = messages.find((m) => m._getType() === 'system');
  const content = typeof system?.content === 'string' ? system.content : '';
  return content.includes('expert RFP analyst') && content.includes('JSON array');
}

/**
 * Deterministic stub: scan the RFP text for question-like lines so the
 * question-generation flow is exercisable without a real LLM key.
 */
function buildExtractQuestionsMockJson(prompt: string): string {
  const header = 'RFP document text:';
  const idx = prompt.indexOf(header);
  const body = idx === -1 ? prompt : prompt.slice(idx + header.length);
  const lines = body
    .split(/\r?\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 8);
  const questions: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const clean = line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim();
    const isQuestion =
      clean.endsWith('?') ||
      /^(describe|provide|list|explain|outline|detail|identify|include|submit|specify|state|confirm|please)\b/i.test(
        clean,
      );
    if (!isQuestion) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    questions.push(clean);
    if (questions.length >= 10) break;
  }
  if (questions.length === 0) {
    questions.push(
      'Describe your company and relevant experience.',
      'Provide pricing for the proposed scope of work.',
      'Outline your implementation timeline.',
    );
  }
  return JSON.stringify(questions);
}
