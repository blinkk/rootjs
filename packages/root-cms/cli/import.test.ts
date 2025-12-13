// @vitest-environment node
import * as fs from 'node:fs';
import {Timestamp, GeoPoint} from 'firebase-admin/firestore';
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
import {importData} from './import.js';
(getCmsPlugin as any).mockReturnValue(mockCmsPlugin);

describe('Import CLI', () => {
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

  describe('importData', () => {
    it('should import __data.json to the correct document path', async () => {
      // Mock fs structure.
      (fs.readdirSync as any).mockImplementation((dir: string) => {
        if (dir.endsWith('export_dir')) {
          return [
            {name: 'test-col', isDirectory: () => true, isFile: () => false},
          ];
        }
        if (dir.endsWith('test-col')) {
          return [{name: 'doc1', isDirectory: () => true, isFile: () => false}];
        }
        if (dir.endsWith('doc1')) {
          return [
            {name: '__data.json', isDirectory: () => false, isFile: () => true},
          ];
        }
        return [];
      });

      (fs.readFileSync as any).mockImplementation((path: string) => {
        if (path.endsWith('__data.json')) {
          return JSON.stringify({title: 'Doc 1'});
        }
        return '{}';
      });

      // Mock prompt to say yes.
      vi.mock('node:readline', () => ({
        createInterface: () => ({
          question: (_q: string, cb: (a: string) => void) => cb('yes'),
          close: vi.fn(),
        }),
      }));

      const mockDocRef = {
        set: vi.fn().mockResolvedValue(undefined),
      };
      mockFirestore.doc.mockReturnValue(mockDocRef);

      await importData({
        dir: 'export_dir',
        site: 'test-site',
        filter: 'test-col/**',
      });

      // Verify db.doc was called with the correct path for __data.json.
      // It should be Projects/test-site/test-col/doc1 (not .../doc1/__data).
      expect(mockFirestore.doc).toHaveBeenCalledWith(
        'Projects/test-site/test-col/doc1'
      );
      expect(mockDocRef.set).toHaveBeenCalledWith(
        {title: 'Doc 1'},
        {merge: true}
      );
    });

    it('should convert timestamps correctly', async () => {
      // Mock fs structure.
      (fs.readdirSync as any).mockImplementation((dir: string) => {
        if (dir.endsWith('export_dir')) {
          return [
            {name: 'test-col', isDirectory: () => true, isFile: () => false},
          ];
        }
        if (dir.endsWith('test-col')) {
          return [
            {name: 'doc1.json', isDirectory: () => false, isFile: () => true},
          ];
        }
        return [];
      });

      (fs.readFileSync as any).mockReturnValue(
        JSON.stringify({
          createdAt: {_seconds: 1600000000, _nanoseconds: 0},
        })
      );

      // Mock prompt.
      vi.mock('node:readline', () => ({
        createInterface: () => ({
          question: (_q: string, cb: (a: string) => void) => cb('yes'),
          close: vi.fn(),
        }),
      }));

      const mockDocRef = {
        set: vi.fn().mockResolvedValue(undefined),
      };
      mockFirestore.doc.mockReturnValue(mockDocRef);

      await importData({
        dir: 'export_dir',
        site: 'test-site',
        filter: 'test-col/**',
      });

      expect(mockDocRef.set).toHaveBeenCalledWith({
        createdAt: new Timestamp(1600000000, 0),
      });
    });

    it('should convert GeoPoint and DocumentReference correctly', async () => {
      // Mock fs structure.
      (fs.readdirSync as any).mockImplementation((dir: string) => {
        if (dir.endsWith('export_dir')) {
          return [
            {name: 'test-col', isDirectory: () => true, isFile: () => false},
          ];
        }
        if (dir.endsWith('test-col')) {
          return [
            {name: 'doc1.json', isDirectory: () => false, isFile: () => true},
          ];
        }
        return [];
      });

      (fs.readFileSync as any).mockReturnValue(
        JSON.stringify({
          location: {_latitude: 37.7749, _longitude: -122.4194},
          ref: {_referencePath: 'Projects/other'},
        })
      );

      // Mock prompt.
      vi.mock('node:readline', () => ({
        createInterface: () => ({
          question: (_q: string, cb: (a: string) => void) => cb('yes'),
          close: vi.fn(),
        }),
      }));

      const mockDocRef = {
        set: vi.fn().mockResolvedValue(undefined),
      };
      mockFirestore.doc.mockImplementation((path) => {
        if (path === 'Projects/other') return {path: 'Projects/other'};
        return mockDocRef;
      });

      await importData({
        dir: 'export_dir',
        site: 'test-site',
        filter: 'test-col/**',
      });

      expect(mockDocRef.set).toHaveBeenCalledWith({
        location: new GeoPoint(37.7749, -122.4194),
        ref: {path: 'Projects/other'},
      });
    });
  });
});
