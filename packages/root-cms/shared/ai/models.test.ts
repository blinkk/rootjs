import {describe, expect, it} from 'vitest';
import {resolveImageModel, resolveLanguageModel} from './models.js';

describe('resolveLanguageModel', () => {
  it('loads each provider on demand', async () => {
    const providers = {
      openai: 'openai',
      anthropic: 'anthropic',
      google: 'google',
    } as const;
    for (const [provider, expected] of Object.entries(providers)) {
      const model = await resolveLanguageModel({
        id: 'test-model',
        provider: provider as keyof typeof providers,
        apiKey: 'test-key',
      });
      expect(typeof model === 'object' && model.provider).toContain(expected);
    }
  });

  it('loads the openai-compatible and vertex providers', async () => {
    const compatible = await resolveLanguageModel({
      id: 'local',
      provider: 'openai-compatible',
      baseURL: 'http://localhost:1234/v1',
    });
    expect(typeof compatible === 'object' && compatible.provider).toContain(
      'local'
    );
    const vertex = await resolveLanguageModel({
      id: 'gemini-2.5-flash',
      provider: 'google-vertex',
      apiKey: 'test-key',
    });
    expect(typeof vertex === 'object' && vertex.provider).toBe(
      'google.vertex.chat'
    );
  });

  it('rejects an invalid config', async () => {
    await expect(
      resolveLanguageModel({id: 'local', provider: 'openai-compatible'})
    ).rejects.toThrow(/requires a baseURL/);
  });
});

describe('resolveImageModel', () => {
  it('rejects providers without image generation', async () => {
    await expect(
      resolveImageModel({
        id: 'test-model',
        provider: 'anthropic',
        apiKey: 'test-key',
      })
    ).rejects.toThrow(/does not support image generation/);
  });
});
