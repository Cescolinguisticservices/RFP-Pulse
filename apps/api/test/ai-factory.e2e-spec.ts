import { ChatAnthropic } from '@langchain/anthropic';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { AIMessage } from '@langchain/core/messages';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatGroq } from '@langchain/groq';
import { ChatOpenAI } from '@langchain/openai';

import { LLMProvider as LLMProviderEnum } from '@rfp-pulse/db';

import { DraftAnswerService } from '../src/ai/draft-answer.service';
import { createChatModel, providerNameFromEnum, type LLMProviderName } from '../src/ai/llm.factory';
import { RagService, type RetrievedEntry } from '../src/ai/rag.service';

describe('LLM Strategy factory (Step 3.16)', () => {
  const apiKey = 'test-key-not-real';

  it.each<[LLMProviderName, new (...args: never[]) => unknown]>([
    ['openai', ChatOpenAI],
    ['gemini', ChatGoogleGenerativeAI],
    ['claude', ChatAnthropic],
    ['llama', ChatGroq],
  ])('instantiates the correct LangChain class for provider %s', (provider, Ctor) => {
    const model = createChatModel({ provider, apiKey });
    expect(model).toBeInstanceOf(Ctor);
  });

  it('maps the Prisma LLMProvider enum onto the factory string names', () => {
    expect(providerNameFromEnum(LLMProviderEnum.OPENAI)).toBe('openai');
    expect(providerNameFromEnum(LLMProviderEnum.GEMINI)).toBe('gemini');
    expect(providerNameFromEnum(LLMProviderEnum.CLAUDE)).toBe('claude');
    expect(providerNameFromEnum(LLMProviderEnum.LLAMA)).toBe('llama');
  });

  it('throws on an unknown provider name', () => {
    expect(() =>
      createChatModel({ provider: 'bogus' as unknown as LLMProviderName, apiKey }),
    ).toThrow(/Unknown LLM provider/);
  });
});

describe('DraftAnswerService (Step 3 RAG + strategy integration)', () => {
  const fakeRetrieved: RetrievedEntry[] = [
    {
      id: 'kb-1',
      title: 'Security compliance',
      content: 'SOC 2 Type II audited annually; ISO 27001 certified.',
      source: null,
      similarity: 0.92,
    },
    {
      id: 'kb-2',
      title: 'Pricing model',
      content: 'Tiered per-seat SaaS pricing with volume discounts.',
      source: null,
      similarity: 0.11,
    },
  ];

  it('retrieves the top-K context, routes to the selected provider, and returns the draft', async () => {
    const rag = {
      retrieveTopK: jest.fn().mockResolvedValue(fakeRetrieved),
    } as unknown as RagService;

    const capturedOptions: Array<{ provider: LLMProviderName }> = [];
    const invokeSpy = jest.fn(async () => new AIMessage('SOC 2 Type II; ISO 27001.'));
    const fakeModel = { invoke: invokeSpy } as unknown as BaseChatModel;

    const service = new DraftAnswerService(rag);
    service.setChatModelBuilder((opts) => {
      capturedOptions.push(opts);
      return fakeModel;
    });

    const result = await service.draft({
      tenantId: 'tenant-x',
      question: 'Describe your security posture.',
      provider: LLMProviderEnum.CLAUDE,
      topK: 2,
    });

    expect(rag.retrieveTopK).toHaveBeenCalledWith('tenant-x', 'Describe your security posture.', 2);
    expect(capturedOptions).toEqual([{ provider: 'claude' }]);
    expect(invokeSpy).toHaveBeenCalledTimes(1);
    const prompt = invokeSpy.mock.calls[0][0] as Array<{ content: unknown }>;
    const human = prompt[1];
    expect(String(human.content)).toContain('SOC 2 Type II audited annually');
    expect(String(human.content)).toContain('Pricing model');
    expect(String(human.content)).toContain('Describe your security posture.');
    expect(result).toEqual({
      draft: 'SOC 2 Type II; ISO 27001.',
      retrieved: fakeRetrieved,
      provider: 'claude',
    });
  });
});
