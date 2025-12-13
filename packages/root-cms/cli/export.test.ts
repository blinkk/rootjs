// @vitest-environment node
import * as fs from 'node:fs';
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';

// Mock dependencies.
vi.mock('node:fs');
vi.mock('node:readline');
vi.mock('cli-progress');
vi.mock('@blinkk/root/node', () => ({
  loadRootConfig: vi.fn().mockResolvedValue({}),
}));
vi.mock('../core/client.js', () => ({
  getCmsPlugin: vi.fn(),
}));

// Mock Firestore.
const mockFirestore = {
  collection: vi.fn(),
  doc: vi.fn(),
};

const mockCmsPlugin = {
  getConfig: vi.fn().mockReturnValue({
    id: 'test-site',
    firebaseConfig: {projectId: 'test-project'},
  }),
  getFirestore: vi.fn().mockReturnValue(mockFirestore),
};

import {getCmsPlugin} from '../core/client.js';
import {exportData} from './export.js';
(getCmsPlugin as any).mockReturnValue(mockCmsPlugin);

describe('Export CLI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mocks.
    (fs.existsSync as any).mockReturnValue(true);
    (fs.mkdirSync as any).mockReturnValue(undefined);
    (fs.writeFileSync as any).mockReturnValue(undefined);
    (fs.readFileSync as any).mockReturnValue('{}');
    (fs.readdirSync as any).mockReturnValue([]);
    // Mock console to avoid clutter.
    vi.spyOn(console, 'table').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('exportData', () => {
    it('should export project document to __data.json', async () => {
      const mockProjectDoc = {
        exists: true,
        data: vi.fn().mockReturnValue({roles: {admin: 'user'}}),
      };
      const mockProjectRef = {
        get: vi.fn().mockResolvedValue(mockProjectDoc),
        listCollections: vi.fn().mockResolvedValue([]),
      };
      mockFirestore.doc.mockReturnValue(mockProjectRef);

      await exportData({site: 'test-site'});

      expect(mockFirestore.doc).toHaveBeenCalledWith('Projects/test-site');
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('__data.json'),
        expect.stringContaining('"roles":')
      );
    });

    it('should NOT export project document if filter is specified', async () => {
      const mockProjectDoc = {
        exists: true,
        data: vi.fn().mockReturnValue({roles: {admin: 'user'}}),
      };
      const mockProjectRef = {
        get: vi.fn().mockResolvedValue(mockProjectDoc),
        listCollections: vi.fn().mockResolvedValue([]),
      };
      mockFirestore.doc.mockReturnValue(mockProjectRef);

      await exportData({site: 'test-site', filter: 'SomeCollection'});

      expect(fs.writeFileSync).not.toHaveBeenCalledWith(
        expect.stringContaining('__data.json'),
        expect.any(String)
      );
    });

    it('should export documents with subcollections to __data.json in a folder', async () => {
      // Setup mock data.
      const mockCollection = {
        listDocuments: vi.fn().mockResolvedValue([{id: 'doc1'}]),
        get: vi.fn().mockResolvedValue({
          docs: [{id: 'doc1', data: () => ({title: 'Doc 1'})}],
        }),
      };
      const mockDocRef = {
        id: 'doc1',
        listCollections: vi
          .fn()
          .mockResolvedValue([{id: 'subcol', path: 'col/doc1/subcol'}]),
      };

      // Mock listDocuments to return ref with listCollections.
      mockCollection.listDocuments.mockResolvedValue([mockDocRef]);

      // Mock subcollection.
      const mockSubCollection = {
        listDocuments: vi.fn().mockResolvedValue([]),
        get: vi.fn().mockResolvedValue({docs: []}),
      };

      mockFirestore.collection.mockImplementation((path) => {
        if (path === 'col/doc1/subcol') return mockSubCollection;
        return mockCollection;
      });

      // Mock project listing to return our test collection.
      const mockProjectRef = {
        get: vi.fn().mockResolvedValue({exists: false}),
        listCollections: vi.fn().mockResolvedValue([{id: 'test-col'}]),
      };
      mockFirestore.doc.mockReturnValue(mockProjectRef);

      await exportData({site: 'test-site', filter: 'test-col/**'});

      // Verify fs.writeFileSync was called with __data.json for doc1.
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('doc1/__data.json'),
        expect.stringContaining('"title": "Doc 1"')
      );
    });

    it('should export DocumentReference as _referencePath', async () => {
      const mockDocRef = {
        exists: true,
        data: vi.fn().mockReturnValue({
          ref: {
            path: 'Projects/other',
            constructor: {name: 'DocumentReference'},
          },
        }),
      };
      const mockProjectRef = {
        get: vi.fn().mockResolvedValue(mockDocRef),
        listCollections: vi.fn().mockResolvedValue([]),
      };
      mockFirestore.doc.mockReturnValue(mockProjectRef);

      await exportData({site: 'test-site'});

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('__data.json'),
        expect.stringContaining('"_referencePath": "Projects/other"')
      );
    });

    it('should filter documents recursively', async () => {
      // Setup mock data.
      const mockCollection = {
        listDocuments: vi.fn().mockResolvedValue([{id: 'doc1'}, {id: 'doc2'}]),
        get: vi.fn().mockResolvedValue({
          docs: [
            {id: 'doc1', data: () => ({title: 'Doc 1'})},
            {id: 'doc2', data: () => ({title: 'Doc 2'})},
          ],
        }),
      };
      const mockDocRef1 = {
        id: 'doc1',
        listCollections: vi.fn().mockResolvedValue([]),
      };
      const mockDocRef2 = {
        id: 'doc2',
        listCollections: vi.fn().mockResolvedValue([]),
      };

      // Mock listDocuments to return refs.
      mockCollection.listDocuments.mockResolvedValue([
        mockDocRef1,
        mockDocRef2,
      ]);

      mockFirestore.collection.mockReturnValue(mockCollection);

      // Mock project listing.
      const mockProjectRef = {
        get: vi.fn().mockResolvedValue({exists: false}),
        listCollections: vi.fn().mockResolvedValue([{id: 'test-col'}]),
      };
      mockFirestore.doc.mockReturnValue(mockProjectRef);

      // Filter to only doc1.
      await exportData({site: 'test-site', filter: 'test-col/doc1'});

      // Verify doc1 exported.
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('doc1.json'),
        expect.stringContaining('"title": "Doc 1"')
      );

      // Verify doc2 NOT exported.
      expect(fs.writeFileSync).not.toHaveBeenCalledWith(
        expect.stringContaining('doc2.json'),
        expect.any(String)
      );
    });
  });
});
