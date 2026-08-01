/**
 * Returns whether AI features are enabled for the project. AI is enabled when
 * chat models are configured via the `ai` plugin option, or via the legacy
 * `experiments.ai` flag.
 */
export function testAiEnabled(): boolean {
  return !!(window.__ROOT_CTX.ai || window.__ROOT_CTX.experiments?.ai);
}

/**
 * Returns whether AI image generation is enabled for the project, i.e. one or
 * more `imageModels` are configured on the `ai` plugin option (or the legacy
 * `experiments.ai` flag is set).
 */
export function testAiImageGenerationEnabled(): boolean {
  return !!(
    window.__ROOT_CTX.ai?.imageGenerationEnabled ||
    window.__ROOT_CTX.experiments?.ai
  );
}

/** An image model that can edit an existing image, as shown in the UI. */
export interface AiImageEditingModel {
  id: string;
  label: string;
  description?: string;
}

/**
 * Returns the configured image models that support image-to-image editing,
 * with the project's default image model first when it qualifies.
 */
export function getAiImageEditingModels(): AiImageEditingModel[] {
  const ai = window.__ROOT_CTX.ai;
  const models = (ai?.imageModels || [])
    .filter((model) => model.editing)
    .map((model) => ({
      id: model.id,
      label: model.label,
      description: model.description,
    }));
  const defaultIndex = models.findIndex((m) => m.id === ai?.defaultImageModel);
  if (defaultIndex > 0) {
    const [defaultModel] = models.splice(defaultIndex, 1);
    models.unshift(defaultModel);
  }
  return models;
}

/**
 * Returns whether AI image editing is available, i.e. the project configures
 * at least one `imageModels` entry that accepts a source image.
 */
export function testAiImageEditingEnabled(): boolean {
  return getAiImageEditingModels().length > 0;
}
