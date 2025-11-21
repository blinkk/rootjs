import {useMemo} from 'preact/hooks';
import {getNestedValue} from '../utils/objects.js';

/**
 * Hook to filter documents based on a search query.
 * Searches across document ID, slug, and preview title.
 */
export function useFilteredDocs(docs: any[], searchQuery: string) {
  return useMemo(() => {
    if (!searchQuery.trim()) {
      return docs;
    }
    const query = searchQuery.toLowerCase();
    return docs.filter((doc: any) => {
      const [collection, slug] = doc.id.split('/');
      const fields = doc.fields || {};
      const rootCollection = window.__ROOT_CTX.collections[collection];
      const previewTitle = getNestedValue(
        fields,
        rootCollection.preview?.title || 'meta.title'
      );
      const title = previewTitle || '';
      return (
        doc.id.toLowerCase().includes(query) ||
        title.toLowerCase().includes(query) ||
        slug.toLowerCase().includes(query)
      );
    });
  }, [docs, searchQuery]);
}
