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
