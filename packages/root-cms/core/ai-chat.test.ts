import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {
  AiConfig,
  buildSystemPrompt,
  deriveChatTitle,
  findModel,
  readRootMd,
  ROOT_MD_FILENAME,
  serializeAiConfig,
  stripUndefined,
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

  describe('readRootMd', () => {
    let tmpDir: string;

    beforeEach(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'root-md-test-'));
    });

    afterEach(async () => {
      await fs.rm(tmpDir, {recursive: true, force: true});
    });

    it('returns null when ROOT.md is missing', async () => {
      expect(await readRootMd(tmpDir)).toBeNull();
    });

    it('returns trimmed contents when ROOT.md exists', async () => {
      await fs.writeFile(
        path.join(tmpDir, ROOT_MD_FILENAME),
        '\n\n# Project conventions\n\nUse `Foo` for bar.\n\n'
      );
      expect(await readRootMd(tmpDir)).toBe(
        '# Project conventions\n\nUse `Foo` for bar.'
      );
    });

    it('returns null for an empty/whitespace-only file', async () => {
      await fs.writeFile(path.join(tmpDir, ROOT_MD_FILENAME), '   \n\n');
      expect(await readRootMd(tmpDir)).toBeNull();
    });
  });

  describe('buildSystemPrompt', () => {
    it('returns the base prompt unchanged when ROOT.md is null', () => {
      expect(buildSystemPrompt('base prompt', null)).toBe('base prompt');
    });

    it('appends ROOT.md contents inside a delimited section', () => {
      const result = buildSystemPrompt('base prompt', '# Conventions');
      expect(result).toContain('base prompt');
      expect(result).toContain('<ROOT.md>');
      expect(result).toContain('# Conventions');
      expect(result).toContain('</ROOT.md>');
      // The framework prompt should come first; the project file second.
      expect(result.indexOf('base prompt')).toBeLessThan(
        result.indexOf('<ROOT.md>')
      );
    });
  });

  describe('stripUndefined', () => {
    it('removes undefined keys at every depth', () => {
      const out = stripUndefined({
        a: 1,
        b: undefined,
        nested: {x: undefined, y: 'keep'},
      });
      expect(out).toEqual({a: 1, nested: {y: 'keep'}});
    });

    it('removes undefined entries from arrays', () => {
      const out = stripUndefined([1, undefined, {meta: undefined, ok: true}]);
      expect(out).toEqual([1, {ok: true}]);
    });

    it('preserves null values (only undefined is removed)', () => {
      const out = stripUndefined({a: null, b: undefined});
      expect(out).toEqual({a: null});
    });

    it('returns primitives unchanged', () => {
      expect(stripUndefined('hello')).toBe('hello');
      expect(stripUndefined(42)).toBe(42);
      expect(stripUndefined(null)).toBeNull();
    });
  });
});
