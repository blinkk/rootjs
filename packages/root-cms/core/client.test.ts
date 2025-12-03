import {RootConfig} from '@blinkk/root';
import {describe, it, expect, beforeEach, vi} from 'vitest';
import * as schema from './schema.js';

// Mock Firebase Admin.
vi.mock('firebase-admin/app', () => ({
  getApp: vi.fn(),
  initializeApp: vi.fn(),
  applicationDefault: vi.fn(),
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    doc: vi.fn(() => ({
      get: vi.fn(() => ({exists: false, data: () => ({})})),
      set: vi.fn(),
    })),
  })),
  Timestamp: {
    now: vi.fn(() => ({toMillis: () => 1234567890})),
  },
  FieldValue: {},
}));

// Mock project module.
vi.mock('./project.js', () => ({
  getCollectionSchema: vi.fn(),
}));

describe('RootCMSClient Validation', () => {
  let mockRootConfig: RootConfig;
  let mockGetCollectionSchema: any;

  beforeEach(async () => {
    // Reset mocks.
    vi.clearAllMocks();

    // Setup mock root config.
    mockRootConfig = {
      rootDir: '/test',
      plugins: [
        {
          name: 'root-cms',
          getConfig: () => ({
            id: 'test-project',
            firebaseConfig: {
              apiKey: 'test',
              authDomain: 'test',
              projectId: 'test-project',
              storageBucket: 'test',
            },
          }),
          getFirebaseApp: vi.fn(),
          getFirestore: vi.fn(() => ({
            doc: vi.fn(() => ({
              get: vi.fn(() => ({exists: false, data: () => ({})})),
              set: vi.fn(),
            })),
          })),
        } as any,
      ],
    } as any;

    // Import after mocks are set up.
    const projectModule = await import('./project.js');
    mockGetCollectionSchema = projectModule.getCollectionSchema as any;
  });

  describe('getCollection', () => {
    it('returns collection schema when it exists', async () => {
      const {RootCMSClient} = await import('./client.js');
      const client = new RootCMSClient(mockRootConfig);

      const testSchema = schema.define({
        name: 'TestCollection',
        fields: [schema.string({id: 'title'})],
      });

      mockGetCollectionSchema.mockResolvedValue(testSchema);

      const result = await client.getCollection('TestCollection');

      expect(mockGetCollectionSchema).toHaveBeenCalledWith('TestCollection');
      expect(result).toEqual(testSchema);
    });

    it('returns null when collection does not exist', async () => {
      const {RootCMSClient} = await import('./client.js');
      const client = new RootCMSClient(mockRootConfig);

      mockGetCollectionSchema.mockResolvedValue(null);

      const result = await client.getCollection('NonExistent');

      expect(result).toBeNull();
    });
  });

  describe('saveDraftData with validation', () => {
    it('validates and saves successfully with valid data', async () => {
      const {RootCMSClient} = await import('./client.js');
      const client = new RootCMSClient(mockRootConfig);

      const testSchema = schema.define({
        name: 'Pages',
        fields: [schema.string({id: 'title'}), schema.number({id: 'count'})],
      });

      mockGetCollectionSchema.mockResolvedValue(testSchema);

      const validData = {
        title: 'Test Page',
        count: 42,
      };

      // Should not throw.
      await expect(
        client.saveDraftData('Pages/test', validData, {
          validate: true,
        })
      ).resolves.not.toThrow();
    });

    it('throws error with validation details when data is invalid', async () => {
      const {RootCMSClient} = await import('./client.js');
      const client = new RootCMSClient(mockRootConfig);

      const testSchema = schema.define({
        name: 'Pages',
        fields: [schema.string({id: 'title'}), schema.number({id: 'count'})],
      });

      mockGetCollectionSchema.mockResolvedValue(testSchema);

      const invalidData = {
        title: 123, // Should be string.
        count: 'invalid', // Should be number.
      };

      await expect(
        client.saveDraftData('Pages/test', invalidData, {
          validate: true,
        })
      ).rejects.toThrow(/Validation failed for Pages\/test/);
    });

    it('throws error when collection schema not found', async () => {
      const {RootCMSClient} = await import('./client.js');
      const client = new RootCMSClient(mockRootConfig);

      mockGetCollectionSchema.mockResolvedValue(null);

      await expect(
        client.saveDraftData(
          'Pages/test',
          {title: 'Test'},
          {
            validate: true,
          }
        )
      ).rejects.toThrow(/Collection schema not found for: Pages/);
    });

    it('skips validation when validate option is false', async () => {
      const {RootCMSClient} = await import('./client.js');
      const client = new RootCMSClient(mockRootConfig);

      const invalidData = {
        title: 123, // Invalid but validation is off.
      };

      // Should not call getCollectionSchema.
      await client.saveDraftData('Pages/test', invalidData, {
        validate: false,
      });

      expect(mockGetCollectionSchema).not.toHaveBeenCalled();
    });

    it('skips validation when validate option is not provided (backward compatibility)', async () => {
      const {RootCMSClient} = await import('./client.js');
      const client = new RootCMSClient(mockRootConfig);

      const invalidData = {
        title: 123, // Invalid but validation is off by default.
      };

      // Should not call getCollectionSchema.
      await client.saveDraftData('Pages/test', invalidData);

      expect(mockGetCollectionSchema).not.toHaveBeenCalled();
    });
  });
});
