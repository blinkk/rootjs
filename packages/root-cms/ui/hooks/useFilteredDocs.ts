import {useEffect, useRef, useState} from 'preact/hooks';
import {
  FieldSnippet,
  findFieldSnippet,
  getNestedValue,
} from '../utils/objects.js';

/**
 * Module-level cache for snippets computed during the deep-search filter
 * phase. Deep-match docs have their snippet stored here so the render path
 * can look them up without re-traversing the doc.
 */
let snippetCache = new Map<string, FieldSnippet>();

/**
 * Returns a cached snippet for the given doc, or `undefined` if the doc
 * wasn't processed during the deep-search phase (i.e. it was a cheap match).
 */
export function getCachedSnippet(docId: string): FieldSnippet | undefined {
  return snippetCache.get(docId);
}

/** Max ms to spend per async batch before yielding to the browser. */
const BATCH_TIME_BUDGET_MS = 8;

/**
 * Async hook to filter documents based on a search query.
 *
 * Phase 1 (synchronous): filters on title, slug, and id — produces instant
 * results for the most common matches.
 *
 * Phase 2 (asynchronous): deep-searches remaining docs' nested fields in
 * time-budgeted batches, yielding to the browser between them so the input
 * and animations stay smooth.
 */
export function useFilteredDocs(docs: any[], searchQuery: string): any[] {
  const [filtered, setFiltered] = useState<any[]>(docs);
  const filterIdRef = useRef(0);

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      snippetCache = new Map();
      setFiltered(docs);
      return;
    }

    const currentId = ++filterIdRef.current;
    const query = trimmed.toLowerCase();

    // Reset snippet cache for the new query.
    snippetCache = new Map();

    // Phase 1: synchronous cheap filter on title, slug, and doc id.
    const cheapMatches: any[] = [];
    const needsDeepSearch: any[] = [];

    for (const doc of docs) {
      const [collectionId, slug] = doc.id.split('/');
      const fields = doc.fields || {};
      const rootCollection = window.__ROOT_CTX.collections[collectionId];
      const previewTitle = getNestedValue(
        fields,
        rootCollection?.preview?.title || 'meta.title'
      );
      const title = previewTitle || '';
      if (
        doc.id.toLowerCase().includes(query) ||
        title.toLowerCase().includes(query) ||
        slug.toLowerCase().includes(query)
      ) {
        cheapMatches.push(doc);
      } else if (query.length >= 3) {
        needsDeepSearch.push(doc);
      }
    }

    // Show cheap results right away.
    setFiltered(cheapMatches);

    if (needsDeepSearch.length === 0 || filterIdRef.current !== currentId) {
      return;
    }

    // Phase 2: async deep-search in time-budgeted batches.
    const deepMatches: any[] = [];
    let i = 0;

    const processBatch = () => {
      if (filterIdRef.current !== currentId) return;

      const deadline = performance.now() + BATCH_TIME_BUDGET_MS;
      while (i < needsDeepSearch.length) {
        const doc = needsDeepSearch[i];
        const snippet = findFieldSnippet(doc.fields, query);
        if (snippet) {
          deepMatches.push(doc);
          snippetCache.set(doc.id, snippet);
        }
        i++;
        if (performance.now() >= deadline) break;
      }

      if (filterIdRef.current !== currentId) return;

      if (i < needsDeepSearch.length) {
        setTimeout(processBatch, 0);
      } else {
        // All batches done — merge deep matches in.
        setFiltered([...cheapMatches, ...deepMatches]);
      }
    };

    setTimeout(processBatch, 0);
  }, [docs, searchQuery]);

  return filtered;
}
