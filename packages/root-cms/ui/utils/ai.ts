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
