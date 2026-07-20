/**
 * Human-readable labels for CMS tool calls, shared between the Root AI page
 * (`RootAIChat`) and the "Edit with AI" modal (`AiEditModal/ChatPanel`) so both
 * surfaces render tool calls identically.
 */

/** Returns a friendly title for a tool call given its name and input. */
export function prettyToolName(toolName: string, input: any): string {
  switch (toolName) {
    case 'collections_list':
      return 'List collections';
    case 'docs_list':
      return `List ${input?.collectionId || 'documents'}`;
    case 'docs_search':
      return `Search docs${input?.query ? ` for "${input.query}"` : ''}`;
    case 'doc_get':
      return `Read ${input?.docId || 'document'}`;
    case 'doc_getVersion':
      return `Read ${input?.docId || 'document'} version`;
    case 'doc_set':
      return `Replace ${input?.docId || 'draft fields'}`;
    case 'doc_create':
      return `Create ${input?.docId || 'draft document'}`;
    case 'doc_updateField':
      return `Update ${input?.path || 'field'}`;
    case 'doc_edit':
      return `Edit ${input?.docId || 'document'}`;
    case 'doc_duplicate':
      return `Duplicate ${input?.fromDocId || 'document'}`;
    case 'doc_listVersions':
      return `List versions for ${input?.docId || 'document'}`;
    case 'doc_translateField':
      return 'Translate field text';
    case 'schema_get':
      return `Read ${input?.collectionId || 'collection'} schema`;
    case 'releases_list':
      return 'List releases';
    case 'release_get':
      return `Read release ${input?.releaseId || ''}`.trim();
    case 'release_create':
      return `Create release ${input?.releaseId || ''}`.trim();
    case 'release_update':
      return `Update release ${input?.releaseId || ''}`.trim();
    default:
      return toolName;
  }
}

/** Returns a friendly label for a tool call's execution state. */
export function prettyToolState(state: string): string {
  switch (state) {
    case 'input-streaming':
      return 'preparing…';
    case 'input-available':
      return 'running…';
    case 'output-available':
      return 'done';
    case 'output-error':
      return 'error';
    default:
      return state;
  }
}
