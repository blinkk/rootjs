import {describe, expect, it} from 'vitest';
import {
  AiConfig,
  deriveChatTitle,
  findModel,
  serializeAiConfig,
} from './ai-chat.js';

describe('ai-chat', () => {
  const config: AiConfig = {
    models: [
      {
        id: 'gpt-4o',
        label: 'GPT-4o',
        provider: 'openai',
        apiKey: 'sk-test',
        capabilities: {tools: true, attachments: true},
      },
      {
        id: 'claude-opus',
        label: 'Claude Opus',
        provider: 'anthropic',
        apiKey: 'sk-ant',
        capabilities: {tools: true, reasoning: true},
      },
    ],
    defaultModel: 'claude-opus',
  };

  describe('findModel', () => {
    it('returns the requested model when present', () => {
      expect(findModel(config, 'gpt-4o')?.id).toBe('gpt-4o');
    });

    it('falls back to the configured default when modelId is missing', () => {
      expect(findModel(config)?.id).toBe('claude-opus');
    });

    it('falls back to the first model when default is unset', () => {
      const noDefault: AiConfig = {models: config.models};
      expect(findModel(noDefault)?.id).toBe('gpt-4o');
    });

    it('falls back to the default for unknown ids', () => {
      expect(findModel(config, 'unknown')?.id).toBe('claude-opus');
    });
  });

  describe('serializeAiConfig', () => {
    it('strips secrets and normalizes capability defaults', () => {
      const result = serializeAiConfig(config);
      expect(result.defaultModel).toBe('claude-opus');
      expect(result.models).toHaveLength(2);
      const gpt = result.models[0];
      expect(gpt).toMatchObject({
        id: 'gpt-4o',
        label: 'GPT-4o',
        provider: 'openai',
        capabilities: {tools: true, reasoning: false, attachments: true},
      });
      expect((gpt as any).apiKey).toBeUndefined();
      expect((gpt as any).baseURL).toBeUndefined();
    });
  });

  describe('deriveChatTitle', () => {
    it('returns "New chat" for an empty list', () => {
      expect(deriveChatTitle([])).toBe('New chat');
    });

    it('extracts the first user text part', () => {
      const title = deriveChatTitle([
        {
          id: '1',
          role: 'user',
          parts: [{type: 'text', text: 'Hello world'}],
        } as any,
      ]);
      expect(title).toBe('Hello world');
    });

    it('truncates long messages', () => {
      const longText = 'a'.repeat(120);
      const title = deriveChatTitle([
        {id: '1', role: 'user', parts: [{type: 'text', text: longText}]} as any,
      ]);
      expect(title.length).toBeLessThanOrEqual(60);
      expect(title.endsWith('…')).toBe(true);
    });
  });
});
