import {describe, expect, it} from 'vitest';

import {extractJsonFromResponse, getVertexAiModelLocation} from './ai.js';

describe('AI utility functions', () => {
  describe('getVertexAiModelLocation', () => {
    it('should use the global location for Gemini 3 text models', () => {
      expect(getVertexAiModelLocation('gemini-3-flash-preview')).toBe('global');
      expect(getVertexAiModelLocation('gemini-3-pro-preview')).toBe('global');
    });

    it('should use the global location for Gemini 3 models when another region is configured', () => {
      expect(
        getVertexAiModelLocation('gemini-3-flash-preview', 'us-central1')
      ).toBe('global');
    });

    it('should keep the configured location for regional models', () => {
      expect(getVertexAiModelLocation('gemini-2.5-flash', 'us-central1')).toBe(
        'us-central1'
      );
    });

    it('should default regional models to us-central1', () => {
      expect(getVertexAiModelLocation('gemini-2.5-flash')).toBe('us-central1');
    });
  });

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
