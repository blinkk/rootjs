import {describe, expect, it} from 'vitest';

import {extractJsonFromResponse} from './ai.js';

describe('AI utility functions', () => {
  describe('extractJsonFromResponse', () => {
    it('should extract plain JSON', () => {
      const input = '{"en": "Hello", "es": "Hola"}';
      const expected = '{"en": "Hello", "es": "Hola"}';
      expect(extractJsonFromResponse(input)).toBe(expected);
    });

    it('should extract JSON from markdown code blocks with json specifier', () => {
      const input = '```json\n{"en": "Hello", "es": "Hola"}\n```';
      const expected = '{"en": "Hello", "es": "Hola"}';
      expect(extractJsonFromResponse(input)).toBe(expected);
    });

    it('should extract JSON from code blocks without language specifier', () => {
      const input = '```\n{"en": "Hello", "es": "Hola"}\n```';
      const expected = '{"en": "Hello", "es": "Hola"}';
      expect(extractJsonFromResponse(input)).toBe(expected);
    });

    it('should handle JSON with whitespace', () => {
      const input = '  \n  {"en": "Hello"}  \n  ';
      const expected = '{"en": "Hello"}';
      expect(extractJsonFromResponse(input)).toBe(expected);
    });

    it('should handle multiline JSON in code blocks', () => {
      const input = '```json\n{\n  "en": "Hello",\n  "es": "Hola"\n}\n```';
      const expected = '{\n  "en": "Hello",\n  "es": "Hola"\n}';
      expect(extractJsonFromResponse(input)).toBe(expected);
    });

    it('should handle empty strings', () => {
      const input = '';
      const expected = '';
      expect(extractJsonFromResponse(input)).toBe(expected);
    });

    it('should handle JSON with only whitespace around code blocks', () => {
      const input = '  ```json\n{"locale": "value"}\n```  ';
      const expected = '{"locale": "value"}';
      expect(extractJsonFromResponse(input)).toBe(expected);
    });
  });
});
