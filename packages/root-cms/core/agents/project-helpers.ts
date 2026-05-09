/**
 * Helpers used by server-side agent tools that need access to the project's
 * registered collections. Isolated so tests can stub them without depending
 * on the Vite-resolved virtual modules.
 */

/**
 * Returns the list of collections registered in the project, simplified to
 * the metadata an agent picker or list tool needs.
 */
export async function getProjectCollections(): Promise<
  Array<{id: string; name?: string; description?: string}>
> {
  const {getProjectSchemas} = await import('../project.js');
  const schemas = getProjectSchemas();
  const out: Array<{id: string; name?: string; description?: string}> = [];
  for (const [fileId, schema] of Object.entries(schemas)) {
    if (!fileId.startsWith('/collections/')) {
      continue;
    }
    const id = fileId.replace('/collections/', '').replace(/\.schema\.ts$/, '');
    const meta = schema as {name?: string; description?: string};
    out.push({id, name: meta.name, description: meta.description});
  }
  return out;
}
