import {render} from '@testing-library/preact';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
  collection: vi.fn(),
  getDocs: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  documentId: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: mocks.collection,
  getDocs: mocks.getDocs,
  orderBy: mocks.orderBy,
  query: mocks.query,
  documentId: mocks.documentId,
}));

vi.mock('./useFirebase.js', () => ({
  useFirebase: () => ({db: {type: 'mock-db'}}),
}));

import {useDocsList} from './useDocsList.js';

/** Renders the hook and reports its results back to the caller. */
function renderUseDocsList(collectionId: string) {
  const result: {loading: boolean; docs: any[]} = {loading: true, docs: []};
  function TestComponent() {
    const [loading, , docs] = useDocsList(collectionId, {orderBy: 'slug'});
    result.loading = loading;
    result.docs = docs;
    return null;
  }
  render(<TestComponent />);
  return result;
}

describe('useDocsList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.collection.mockImplementation((_db: unknown, ...path: string[]) => ({
      path: path.join('/'),
    }));
    mocks.query.mockImplementation((colRef: any) => colRef);
    mocks.getDocs.mockResolvedValue({docs: []});
    (window as any).__ROOT_CTX = {
      rootConfig: {projectId: 'test-project'},
      collections: {Pages: {}},
    };
  });

  it('queries the collection\u2019s Drafts subcollection', async () => {
    const result = renderUseDocsList('Pages');
    await vi.waitFor(() => expect(result.loading).toBe(false));

    expect(mocks.collection).toHaveBeenCalledWith(
      {type: 'mock-db'},
      'Projects',
      'test-project',
      'Collections',
      'Pages',
      'Drafts'
    );
    expect(mocks.getDocs).toHaveBeenCalled();
  });

  it('skips the query when no collection is selected', async () => {
    const result = renderUseDocsList('');
    await vi.waitFor(() => expect(result.loading).toBe(false));

    // An empty collection id collapses the path to
    // `Projects/<id>/Collections/Drafts`, which firestore rejects.
    expect(mocks.collection).not.toHaveBeenCalled();
    expect(mocks.getDocs).not.toHaveBeenCalled();
    expect(result.docs).toEqual([]);
  });
});
