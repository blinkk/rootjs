import {RootConfig} from '@blinkk/root';
import {generateText} from 'ai';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  resolveLanguageModel,
  testClientModelExpired,
  testHasAuthorizationHeader,
  testSupportsImageEditing,
} from '../shared/ai/models.js';
import {getFirebaseProjectId, resolveVertexCredentials} from './ai-vertex.js';
import {AiModelConfig, serializeAiClientModel} from './ai.js';

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

/** A minimal Gemini `generateContent` response body. */
const GENERATE_CONTENT_RESPONSE = {
  candidates: [
    {
      content: {role: 'model', parts: [{text: 'hello from vertex'}]},
      finishReason: 'STOP',
    },
  ],
  usageMetadata: {
    promptTokenCount: 1,
    candidatesTokenCount: 3,
    totalTokenCount: 4,
  },
};

describe('ai-vertex', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('resolveLanguageModel', () => {
    it('targets the Vertex endpoint with the resolved bearer token', async () => {
      const fetchMock = vi.fn(async () => {
        return new Response(JSON.stringify(GENERATE_CONTENT_RESPONSE), {
          status: 200,
          headers: {'content-type': 'application/json'},
        });
      });
      vi.stubGlobal('fetch', fetchMock);

      const model = resolveLanguageModel({
        id: 'gemini-vertex',
        provider: 'google-vertex',
        modelId: 'gemini-2.5-pro',
        project: 'my-project',
        location: 'us-central1',
        headers: {Authorization: 'Bearer test-token'},
      });
      expect(typeof model).toBe('object');
      expect((model as any).provider).toBe('google.vertex.chat');
      expect((model as any).modelId).toBe('gemini-2.5-pro');

      const result = await generateText({model, prompt: 'hi'});
      expect(result.text).toBe('hello from vertex');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ];
      expect(String(url)).toBe(
        'https://us-central1-aiplatform.googleapis.com/v1beta1/projects/my-project/locations/us-central1/publishers/google/models/gemini-2.5-pro:generateContent'
      );
      const headers = new Headers(init.headers);
      expect(headers.get('authorization')).toBe('Bearer test-token');
      expect(headers.get('x-goog-api-key')).toBeNull();
    });

    it('uses the global host by default', async () => {
      const fetchMock = vi.fn(async () => {
        return new Response(JSON.stringify(GENERATE_CONTENT_RESPONSE), {
          status: 200,
          headers: {'content-type': 'application/json'},
        });
      });
      vi.stubGlobal('fetch', fetchMock);
      const model = resolveLanguageModel({
        id: 'gemini-2.5-flash',
        provider: 'google-vertex',
        project: 'my-project',
        headers: {authorization: 'Bearer test-token'},
      });
      await generateText({model, prompt: 'hi'});
      const [url] = fetchMock.mock.calls[0] as unknown as [string];
      expect(String(url)).toBe(
        'https://aiplatform.googleapis.com/v1beta1/projects/my-project/locations/global/publishers/google/models/gemini-2.5-flash:generateContent'
      );
    });

    it('uses express mode with an api key', async () => {
      const fetchMock = vi.fn(async () => {
        return new Response(JSON.stringify(GENERATE_CONTENT_RESPONSE), {
          status: 200,
          headers: {'content-type': 'application/json'},
        });
      });
      vi.stubGlobal('fetch', fetchMock);
      const model = resolveLanguageModel({
        id: 'gemini-2.5-flash',
        provider: 'google-vertex',
        apiKey: 'express-key',
      });
      await generateText({model, prompt: 'hi'});
      const [url, init] = fetchMock.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ];
      expect(String(url)).toBe(
        'https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-flash:generateContent'
      );
      expect(new Headers(init.headers).get('x-goog-api-key')).toBe(
        'express-key'
      );
    });

    it('throws without credentials or a project', () => {
      expect(() =>
        resolveLanguageModel({
          id: 'gemini-2.5-flash',
          provider: 'google-vertex',
          project: 'my-project',
        })
      ).toThrow(/requires credentials/);
      expect(() =>
        resolveLanguageModel({
          id: 'gemini-2.5-flash',
          provider: 'google-vertex',
          headers: {Authorization: 'Bearer test-token'},
        })
      ).toThrow(/requires a project/);
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

  describe('getFirebaseProjectId', () => {
    it('reads the cms plugin firebase config', () => {
      expect(getFirebaseProjectId(fakeRootConfig('my-project'))).toBe(
        'my-project'
      );
      expect(getFirebaseProjectId(fakeRootConfig())).toBeUndefined();
      expect(getFirebaseProjectId({} as RootConfig)).toBeUndefined();
    });
  });

  describe('serializeAiClientModel', () => {
    it('includes vertex connection fields', () => {
      const serialized = serializeAiClientModel({
        id: 'gemini-vertex',
        provider: 'google-vertex',
        modelId: 'gemini-2.5-pro',
        project: 'my-project',
        location: 'global',
        headers: {Authorization: 'Bearer token'},
        credentialsExpireAt: 123,
      });
      expect(serialized.project).toBe('my-project');
      expect(serialized.location).toBe('global');
      expect(serialized.headers).toEqual({Authorization: 'Bearer token'});
      expect(serialized.credentialsExpireAt).toBe(123);
    });
  });

  describe('testSupportsImageEditing', () => {
    it('accepts gemini and imagen capability models on vertex', () => {
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
      ).toBe(true);
      expect(
        testSupportsImageEditing({
          id: 'imagen-4.0-generate-001',
          provider: 'google-vertex',
        })
      ).toBe(false);
    });
  });

  describe('testClientModelExpired', () => {
    it('treats models without an expiry as valid', () => {
      expect(testClientModelExpired({})).toBe(false);
    });

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

  describe('testHasAuthorizationHeader', () => {
    it('matches any casing', () => {
      expect(testHasAuthorizationHeader(undefined)).toBe(false);
      expect(testHasAuthorizationHeader({'X-Custom': '1'})).toBe(false);
      expect(testHasAuthorizationHeader({authorization: 'Bearer x'})).toBe(
        true
      );
    });
  });
});
