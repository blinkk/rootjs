import {RootConfig} from '@blinkk/root';
import {describe, expect, it} from 'vitest';
import {
  resolveLanguageModel,
  testClientModelExpired,
  testSupportsImageEditing,
} from '../shared/ai/models.js';
import {
  resolveServerImageModel,
  resolveVertexCredentials,
} from './ai-vertex.js';
import {AiModelConfig} from './ai.js';

/** Builds a minimal RootConfig with a cms plugin exposing `firebaseConfig`. */
function fakeRootConfig(projectId?: string): RootConfig {
  return {
    plugins: [
      {
        name: 'root-cms',
        getConfig: () => ({
          firebaseConfig: projectId ? {projectId} : undefined,
        }),
      },
    ],
  } as unknown as RootConfig;
}

describe('ai-vertex', () => {
  describe('resolveLanguageModel', () => {
    it('throws without credentials or a project', async () => {
      await expect(
        resolveLanguageModel({
          id: 'gemini-2.5-flash',
          provider: 'google-vertex',
          project: 'my-project',
        })
      ).rejects.toThrow(/requires credentials/);
      await expect(
        resolveLanguageModel({
          id: 'gemini-2.5-flash',
          provider: 'google-vertex',
          headers: {Authorization: 'Bearer test-token'},
        })
      ).rejects.toThrow(/requires a project/);
    });
  });

  describe('resolveVertexCredentials', () => {
    it('returns non-vertex and express-mode models unchanged', async () => {
      const openai: AiModelConfig = {
        id: 'gpt-4o',
        provider: 'openai',
        apiKey: 'sk-test',
      };
      expect(await resolveVertexCredentials(fakeRootConfig('p'), openai)).toBe(
        openai
      );
      const express: AiModelConfig = {
        id: 'gemini-2.5-flash',
        provider: 'google-vertex',
        apiKey: 'express-key',
      };
      expect(await resolveVertexCredentials(fakeRootConfig('p'), express)).toBe(
        express
      );
    });

    it('defaults project and location without minting a token when an Authorization header is set', async () => {
      const resolved = await resolveVertexCredentials(
        fakeRootConfig('firebase-project'),
        {
          id: 'gemini-2.5-flash',
          provider: 'google-vertex',
          headers: {Authorization: 'Bearer preset'},
        }
      );
      expect(resolved.project).toBe('firebase-project');
      expect(resolved.location).toBe('global');
      expect(resolved.headers).toEqual({Authorization: 'Bearer preset'});
      expect(resolved.credentialsExpireAt).toBeUndefined();
    });

    it('prefers an explicit project over the firebase project', async () => {
      const resolved = await resolveVertexCredentials(
        fakeRootConfig('firebase-project'),
        {
          id: 'gemini-2.5-flash',
          provider: 'google-vertex',
          project: 'explicit-project',
          location: 'europe-west1',
          headers: {Authorization: 'Bearer preset'},
        }
      );
      expect(resolved.project).toBe('explicit-project');
      expect(resolved.location).toBe('europe-west1');
    });
  });

  describe('resolveServerImageModel', () => {
    it('rejects retired imagen models on vertex', async () => {
      await expect(
        resolveServerImageModel(fakeRootConfig('my-project'), {
          id: 'imagen',
          provider: 'google-vertex',
          modelId: 'imagen-4.0-generate-001',
          apiKey: 'test-key',
        })
      ).rejects.toThrow(/Google retired the Imagen API/);
    });
  });

  describe('testSupportsImageEditing', () => {
    it('accepts gemini but not imagen models on vertex', () => {
      expect(
        testSupportsImageEditing({
          id: 'gemini-2.5-flash-image',
          provider: 'google-vertex',
        })
      ).toBe(true);
      expect(
        testSupportsImageEditing({
          id: 'imagen-3.0-capability-001',
          provider: 'google-vertex',
        })
      ).toBe(false);
      expect(
        testSupportsImageEditing({
          id: 'imagen-4.0-generate-001',
          provider: 'google-vertex',
        })
      ).toBe(false);
    });
  });

  describe('testClientModelExpired', () => {
    it('expires shortly before the deadline', () => {
      const now = 1_000_000_000;
      expect(
        testClientModelExpired({credentialsExpireAt: now + 10 * 60 * 1000}, now)
      ).toBe(false);
      expect(
        testClientModelExpired({credentialsExpireAt: now + 60 * 1000}, now)
      ).toBe(true);
      expect(testClientModelExpired({credentialsExpireAt: now - 1}, now)).toBe(
        true
      );
    });
  });
});
