/**
 * Server-side helpers for `google-vertex` models.
 *
 * Vertex AI authenticates with Google Cloud OAuth access tokens rather than
 * API keys. A `google-vertex` model with no express-mode `apiKey` is completed
 * here before it reaches the AI SDK: the project id falls back to the CMS's
 * `firebaseConfig.projectId` (then to the Application Default Credentials
 * project), and a short-lived bearer token minted from Application Default
 * Credentials is attached as an `Authorization` header. The browser streams
 * chat turns directly from the provider, so the `prepare` endpoints hand the
 * client this resolved config (token included) rather than the underlying
 * credentials, which never leave the server.
 */
import {createVertex} from '@ai-sdk/google-vertex';
import {RootConfig} from '@blinkk/root';
import {ImageModel} from 'ai';
import {GoogleAuth} from 'google-auth-library';
import {
  AiModelConfig,
  DEFAULT_VERTEX_LOCATION,
  resolveImageModel,
  testHasAuthorizationHeader,
} from '../shared/ai/models.js';

/** OAuth scope required by the Vertex AI API. */
const VERTEX_AI_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

/** Assumed access-token lifetime when the auth client does not report one. */
const FALLBACK_TOKEN_TTL_MS = 55 * 60 * 1000;

/** A model config whose request-time credentials have been resolved. */
export interface ResolvedAiModelConfig extends AiModelConfig {
  /** Epoch ms after which the `Authorization` header in `headers` expires. */
  credentialsExpireAt?: number;
}

let googleAuth: GoogleAuth | undefined;

/**
 * Returns the shared `GoogleAuth` client. It discovers Application Default
 * Credentials once and caches/refreshes access tokens internally.
 */
function getGoogleAuth(): GoogleAuth {
  if (!googleAuth) {
    googleAuth = new GoogleAuth({scopes: [VERTEX_AI_SCOPE]});
  }
  return googleAuth;
}

/** Returns the GCP project id from the cms plugin's `firebaseConfig`, if set. */
export function getFirebaseProjectId(
  rootConfig: RootConfig
): string | undefined {
  const cmsPlugin = rootConfig.plugins?.find((p) => p.name === 'root-cms') as
    | {getConfig: () => {firebaseConfig?: {projectId?: string}}}
    | undefined;
  return cmsPlugin?.getConfig()?.firebaseConfig?.projectId || undefined;
}

/**
 * Resolves the GCP project for a `google-vertex` model: the model's own
 * `project`, then the CMS's Firebase project, then the Application Default
 * Credentials project.
 */
async function resolveVertexProject(
  rootConfig: RootConfig,
  model: AiModelConfig
): Promise<string> {
  const project = model.project || getFirebaseProjectId(rootConfig);
  if (project) {
    return project;
  }
  return await getGoogleAuth().getProjectId();
}

/** Wraps a credential failure with setup guidance for the given model. */
function toCredentialsError(model: AiModelConfig, err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err);
  return new Error(
    `failed to resolve Google Cloud credentials for model "${model.id}": ${message}. ` +
      'Configure Application Default Credentials (e.g. `gcloud auth application-default login` locally, or the runtime service account in production) or set an express-mode `apiKey`.'
  );
}

/**
 * Completes a `google-vertex` model config for a request by filling in the
 * project/location defaults and attaching a bearer token minted from
 * Application Default Credentials. Models for other providers and express-mode
 * (`apiKey`) models are returned unchanged; a model that already carries an
 * `Authorization` header keeps it and only receives the defaults.
 */
export async function resolveVertexCredentials(
  rootConfig: RootConfig,
  model: AiModelConfig
): Promise<ResolvedAiModelConfig> {
  if (model.provider !== 'google-vertex' || model.apiKey) {
    return model;
  }
  try {
    const resolved: ResolvedAiModelConfig = {
      ...model,
      project: await resolveVertexProject(rootConfig, model),
      location: model.location || DEFAULT_VERTEX_LOCATION,
    };
    if (!testHasAuthorizationHeader(model.headers)) {
      const client = await getGoogleAuth().getClient();
      const {token} = await client.getAccessToken();
      if (!token) {
        throw new Error('no access token returned');
      }
      resolved.headers = {...model.headers, Authorization: `Bearer ${token}`};
      resolved.credentialsExpireAt =
        client.credentials.expiry_date || Date.now() + FALLBACK_TOKEN_TTL_MS;
    }
    return resolved;
  } catch (err) {
    throw toCredentialsError(model, err);
  }
}

/**
 * Resolves an image model on the server. `google-vertex` image models use the
 * Vertex SDK's node build, which authenticates with Application Default
 * Credentials itself; every other provider delegates to `resolveImageModel`.
 */
export async function resolveServerImageModel(
  rootConfig: RootConfig,
  model: AiModelConfig
): Promise<ImageModel> {
  if (model.provider !== 'google-vertex') {
    return resolveImageModel(model);
  }
  let project = model.project;
  if (!model.apiKey) {
    try {
      project = await resolveVertexProject(rootConfig, model);
    } catch (err) {
      throw toCredentialsError(model, err);
    }
  }
  const provider = createVertex({
    apiKey: model.apiKey,
    project,
    location: model.location || DEFAULT_VERTEX_LOCATION,
    baseURL: model.baseURL,
    headers: model.headers,
    googleAuthOptions: {scopes: [VERTEX_AI_SCOPE]},
  });
  return provider.image(model.modelId || model.id);
}
