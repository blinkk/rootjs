import {describe, expect, it} from 'vitest';
import {defineAgent} from './define.js';

describe('defineAgent', () => {
  const validInput = {
    name: 'content-manager',
    icon: '📝',
    description: 'Manages content updates.',
    systemPrompt: 'You manage content.',
  };

  it('returns a normalized definition with default tool bundles', () => {
    const def = defineAgent(validInput);
    expect(def.name).toBe('content-manager');
    expect(def.icon).toBe('📝');
    expect(def.description).toBe('Manages content updates.');
    expect(def.systemPrompt).toBe('You manage content.');
    expect(def.allowedTools).toEqual(['read', 'propose']);
    expect(def.model).toBeUndefined();
    expect(def.maxTokensPerTask).toBeUndefined();
  });

  it('preserves explicit allowedTools and dedupes duplicates', () => {
    const def = defineAgent({
      ...validInput,
      allowedTools: ['read', 'propose', 'subtask', 'read'],
    });
    expect(def.allowedTools).toEqual(['read', 'propose', 'subtask']);
  });

  it('trims whitespace from string fields', () => {
    const def = defineAgent({
      name: '  content-manager  ',
      icon: ' 📝 ',
      description: '  Manages content.  ',
      systemPrompt: '  You manage content.  ',
    });
    expect(def.name).toBe('content-manager');
    expect(def.icon).toBe('📝');
    expect(def.description).toBe('Manages content.');
    expect(def.systemPrompt).toBe('You manage content.');
  });

  it('rejects missing required fields', () => {
    expect(() => defineAgent({...validInput, name: ''})).toThrow(/name/);
    expect(() => defineAgent({...validInput, icon: ''})).toThrow(/icon/);
    expect(() => defineAgent({...validInput, description: ''})).toThrow(
      /description/
    );
    expect(() => defineAgent({...validInput, systemPrompt: ''})).toThrow(
      /systemPrompt/
    );
  });

  it('rejects names that do not match the slug pattern', () => {
    expect(() => defineAgent({...validInput, name: 'Content_Manager'})).toThrow(
      /invalid name/
    );
    expect(() => defineAgent({...validInput, name: '-bad'})).toThrow(
      /invalid name/
    );
    expect(() => defineAgent({...validInput, name: 'AGENT'})).toThrow(
      /invalid name/
    );
  });

  it('rejects unknown tool bundles', () => {
    expect(() =>
      defineAgent({
        ...validInput,
        // @ts-expect-error - testing runtime validation.
        allowedTools: ['read', 'mutate'],
      })
    ).toThrow(/unknown tool bundle "mutate"/);
  });

  it('rejects non-array allowedTools', () => {
    expect(() =>
      defineAgent({
        ...validInput,
        // @ts-expect-error - testing runtime validation.
        allowedTools: 'read',
      })
    ).toThrow(/allowedTools must be an array/);
  });

  it('rejects non-positive maxTokensPerTask', () => {
    expect(() => defineAgent({...validInput, maxTokensPerTask: 0})).toThrow(
      /maxTokensPerTask/
    );
    expect(() => defineAgent({...validInput, maxTokensPerTask: -100})).toThrow(
      /maxTokensPerTask/
    );
    expect(() =>
      // @ts-expect-error - testing runtime validation.
      defineAgent({...validInput, maxTokensPerTask: NaN})
    ).toThrow(/maxTokensPerTask/);
  });

  it('accepts optional model and maxTokensPerTask', () => {
    const def = defineAgent({
      ...validInput,
      model: 'anthropic/claude-sonnet-4-6',
      maxTokensPerTask: 100_000,
    });
    expect(def.model).toBe('anthropic/claude-sonnet-4-6');
    expect(def.maxTokensPerTask).toBe(100_000);
  });
});
