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
    fromMillis: vi.fn((millis: number) => ({
      toMillis: () => millis,
      toDate: () => new Date(millis),
    })),
    fromDate: vi.fn((date: Date) => ({
      toMillis: () => date.getTime(),
      toDate: () => date,
    })),
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

      expect(mockGetCollectionSchema).toHaveBeenCalledWith('TestCollection', {
        rootDir: '/test',
      });
      expect(result).toEqual(testSchema);
    });

    it('returns null when collection does not exist', async () => {
      const {RootCMSClient} = await import('./client.js');
      const client = new RootCMSClient(mockRootConfig);

      mockGetCollectionSchema.mockResolvedValue(null);

      const result = await client.getCollection('NonExistent');

      expect(result).toBeNull();
    });

    it('passes rootDir to getCollectionSchema for filesystem fallback', async () => {
      const {RootCMSClient} = await import('./client.js');
      const client = new RootCMSClient(mockRootConfig);

      mockGetCollectionSchema.mockResolvedValue(null);

      const result = await client.getCollection('Pages');

      // Verify rootDir is passed so getCollectionSchema can use the
      // filesystem fallback in non-Vite environments.
      expect(mockGetCollectionSchema).toHaveBeenCalledWith('Pages', {
        rootDir: '/test',
      });
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

  describe('updateDraftData', () => {
    it('updates a simple field path', async () => {
      const {RootCMSClient} = await import('./client.js');
      const client = new RootCMSClient(mockRootConfig);

      // Mock getRawDoc to return existing data.
      const mockGetRawDoc = vi.fn().mockResolvedValue({
        sys: {},
        fields: {
          title: 'Old Title',
          count: 10,
        },
      });
      client.getRawDoc = mockGetRawDoc as any;

      const mockSetRawDoc = vi.fn();
      client.setRawDoc = mockSetRawDoc as any;

      await client.updateDraftData('Pages/test', 'title', 'New Title');

      // Verify the document was saved with updated title.
      expect(mockSetRawDoc).toHaveBeenCalled();
      const savedData = mockSetRawDoc.mock.calls[0][2];
      expect(savedData.fields.title).toBe('New Title');
      expect(savedData.fields.count).toBe(10); // Unchanged.
    });

    it('updates a nested field path', async () => {
      const {RootCMSClient} = await import('./client.js');
      const client = new RootCMSClient(mockRootConfig);

      const mockGetRawDoc = vi.fn().mockResolvedValue({
        sys: {},
        fields: {
          hero: {
            title: 'Old Hero Title',
            subtitle: 'Subtitle',
          },
        },
      });
      client.getRawDoc = mockGetRawDoc as any;

      const mockSetRawDoc = vi.fn();
      client.setRawDoc = mockSetRawDoc as any;

      await client.updateDraftData(
        'Pages/test',
        'hero.title',
        'New Hero Title'
      );

      const savedData = mockSetRawDoc.mock.calls[0][2];
      expect(savedData.fields.hero.title).toBe('New Hero Title');
      expect(savedData.fields.hero.subtitle).toBe('Subtitle'); // Unchanged.
    });

    it('updates an array item by index', async () => {
      const {RootCMSClient} = await import('./client.js');
      const client = new RootCMSClient(mockRootConfig);

      const mockGetRawDoc = vi.fn().mockResolvedValue({
        sys: {},
        fields: {
          content: {
            _array: ['item1', 'item2'],
            item1: {text: 'First item'},
            item2: {text: 'Second item'},
          },
        },
      });
      client.getRawDoc = mockGetRawDoc as any;

      const mockSaveDraftData = vi.fn();
      client.saveDraftData = mockSaveDraftData as any;

      await client.updateDraftData(
        'Pages/test',
        'content.0.text',
        'Updated first item'
      );

      // Verify saveDraftData was called with the updated data.
      expect(mockSaveDraftData).toHaveBeenCalled();
      const savedData = mockSaveDraftData.mock.calls[0][1];
      expect(savedData.content[0].text).toBe('Updated first item');
      expect(savedData.content[1].text).toBe('Second item');
    });

    it('validates after update when validate: true', async () => {
      const {RootCMSClient} = await import('./client.js');
      const client = new RootCMSClient(mockRootConfig);

      const testSchema = schema.define({
        name: 'Pages',
        fields: [schema.string({id: 'title'}), schema.number({id: 'count'})],
      });

      mockGetCollectionSchema.mockResolvedValue(testSchema);

      const mockGetRawDoc = vi.fn().mockResolvedValue({
        sys: {},
        fields: {
          title: 'Old Title',
          count: 10,
        },
      });
      client.getRawDoc = mockGetRawDoc as any;

      const mockSetRawDoc = vi.fn();
      client.setRawDoc = mockSetRawDoc as any;

      // Valid update.
      await client.updateDraftData('Pages/test', 'title', 'New Title', {
        validate: true,
      });

      expect(mockSetRawDoc).toHaveBeenCalled();
    });

    it('throws validation error when update results in invalid document', async () => {
      const {RootCMSClient} = await import('./client.js');
      const client = new RootCMSClient(mockRootConfig);

      const testSchema = schema.define({
        name: 'Pages',
        fields: [schema.string({id: 'title'}), schema.number({id: 'count'})],
      });

      mockGetCollectionSchema.mockResolvedValue(testSchema);

      const mockGetRawDoc = vi.fn().mockResolvedValue({
        sys: {},
        fields: {
          title: 'Old Title',
          count: 10,
        },
      });
      client.getRawDoc = mockGetRawDoc as any;

      // Try to set count to invalid value.
      await expect(
        client.updateDraftData('Pages/test', 'count', 'invalid', {
          validate: true,
        })
      ).rejects.toThrow(/Validation failed for Pages\/test/);
    });

    it('skips validation when validate: false', async () => {
      const {RootCMSClient} = await import('./client.js');
      const client = new RootCMSClient(mockRootConfig);

      const mockGetRawDoc = vi.fn().mockResolvedValue({
        sys: {},
        fields: {
          title: 'Old Title',
        },
      });
      client.getRawDoc = mockGetRawDoc as any;

      const mockSetRawDoc = vi.fn();
      client.setRawDoc = mockSetRawDoc as any;

      await client.updateDraftData('Pages/test', 'title', 123, {
        validate: false,
      });

      expect(mockGetCollectionSchema).not.toHaveBeenCalled();
      expect(mockSetRawDoc).toHaveBeenCalled();
    });
  });

  describe('setRawDoc sys field validation', () => {
    let mockDocRef: any;
    let mockDb: any;

    beforeEach(() => {
      // Setup mock Firestore for setRawDoc tests.
      mockDocRef = {
        set: vi.fn(),
      };
      mockDb = {
        doc: vi.fn(() => mockDocRef),
      };
      const plugin = mockRootConfig.plugins?.[0] as any;
      if (plugin) {
        plugin.getFirestore = vi.fn(() => mockDb);
      }
    });

    it('validates and converts timestamp numbers to Firestore Timestamps', async () => {
      const {RootCMSClient} = await import('./client.js');
      const client = new RootCMSClient(mockRootConfig);

      const dataWithNumberTimestamps = {
        id: 'Pages/test',
        collection: 'Pages',
        slug: 'test',
        sys: {
          createdAt: 1234567890, // Number instead of Timestamp.
          createdBy: 'user@example.com',
          modifiedAt: 1234567890, // Number instead of Timestamp.
          modifiedBy: 'user@example.com',
        },
        fields: {title: 'Test'},
      };

      await client.setRawDoc('Pages', 'test', dataWithNumberTimestamps, {
        mode: 'draft',
      });

      // Verify that set was called.
      expect(mockDocRef.set).toHaveBeenCalled();

      // Verify that timestamps were converted to Firestore Timestamps.
      const savedData = mockDocRef.set.mock.calls[0][0];
      expect(savedData.sys.createdAt).toBeDefined();
      expect(typeof savedData.sys.createdAt.toMillis).toBe('function');
      expect(savedData.sys.modifiedAt).toBeDefined();
      expect(typeof savedData.sys.modifiedAt.toMillis).toBe('function');
    });

    it('keeps existing Firestore Timestamps unchanged', async () => {
      const {RootCMSClient} = await import('./client.js');
      const {Timestamp} = await import('firebase-admin/firestore');
      const client = new RootCMSClient(mockRootConfig);

      const now = Timestamp.now();
      const dataWithProperTimestamps = {
        id: 'Pages/test',
        collection: 'Pages',
        slug: 'test',
        sys: {
          createdAt: now,
          createdBy: 'user@example.com',
          modifiedAt: now,
          modifiedBy: 'user@example.com',
        },
        fields: {title: 'Test'},
      };

      await client.setRawDoc('Pages', 'test', dataWithProperTimestamps, {
        mode: 'draft',
      });

      const savedData = mockDocRef.set.mock.calls[0][0];
      expect(savedData.sys.createdAt).toBe(now);
      expect(savedData.sys.modifiedAt).toBe(now);
    });

    it('throws error for invalid timestamp types', async () => {
      const {RootCMSClient} = await import('./client.js');
      const client = new RootCMSClient(mockRootConfig);

      const dataWithInvalidTimestamp = {
        id: 'Pages/test',
        collection: 'Pages',
        slug: 'test',
        sys: {
          createdAt: 'invalid-timestamp', // String instead of Timestamp/number.
          createdBy: 'user@example.com',
          modifiedAt: 1234567890,
          modifiedBy: 'user@example.com',
        },
        fields: {title: 'Test'},
      };

      await expect(
        client.setRawDoc('Pages', 'test', dataWithInvalidTimestamp, {
          mode: 'draft',
        })
      ).rejects.toThrow(/Invalid timestamp for sys\.createdAt/);
    });

    it('sets default values for missing required sys fields', async () => {
      const {RootCMSClient} = await import('./client.js');
      const client = new RootCMSClient(mockRootConfig);

      const dataWithMissingSysFields = {
        id: 'Pages/test',
        collection: 'Pages',
        slug: 'test',
        sys: {
          // All required fields are missing - should use defaults.
        },
        fields: {title: 'Test'},
      };

      await client.setRawDoc('Pages', 'test', dataWithMissingSysFields, {
        mode: 'draft',
      });

      expect(mockDocRef.set).toHaveBeenCalled();
      const savedData = mockDocRef.set.mock.calls[0][0];
      expect(savedData.sys.createdAt).toBeDefined();
      expect(typeof savedData.sys.createdAt.toMillis).toBe('function');
      expect(savedData.sys.modifiedAt).toBeDefined();
      expect(typeof savedData.sys.modifiedAt.toMillis).toBe('function');
      expect(savedData.sys.createdBy).toBe('root-cms-client');
      expect(savedData.sys.modifiedBy).toBe('root-cms-client');
      expect(savedData.sys.locales).toEqual(['en']);
    });

    it('uses default for invalid createdBy but keeps valid modifiedBy', async () => {
      const {RootCMSClient} = await import('./client.js');
      const {Timestamp} = await import('firebase-admin/firestore');
      const client = new RootCMSClient(mockRootConfig);

      const dataWithInvalidCreatedBy = {
        id: 'Pages/test',
        collection: 'Pages',
        slug: 'test',
        sys: {
          createdAt: Timestamp.now(),
          createdBy: 123, // Invalid - number instead of string.
          modifiedAt: Timestamp.now(),
          modifiedBy: 'user@example.com',
        },
        fields: {title: 'Test'},
      };

      await client.setRawDoc('Pages', 'test', dataWithInvalidCreatedBy, {
        mode: 'draft',
      });

      expect(mockDocRef.set).toHaveBeenCalled();
      const savedData = mockDocRef.set.mock.calls[0][0];
      expect(savedData.sys.createdBy).toBe('root-cms-client'); // Defaults to root-cms-client.
      expect(savedData.sys.modifiedBy).toBe('user@example.com'); // Keeps valid value.
    });

    it('validates locales array if present', async () => {
      const {RootCMSClient} = await import('./client.js');
      const {Timestamp} = await import('firebase-admin/firestore');
      const client = new RootCMSClient(mockRootConfig);

      const dataWithValidLocales = {
        id: 'Pages/test',
        collection: 'Pages',
        slug: 'test',
        sys: {
          createdAt: Timestamp.now(),
          createdBy: 'user@example.com',
          modifiedAt: Timestamp.now(),
          modifiedBy: 'user@example.com',
          locales: ['en', 'es', 'fr'],
        },
        fields: {title: 'Test'},
      };

      await client.setRawDoc('Pages', 'test', dataWithValidLocales, {
        mode: 'draft',
      });

      expect(mockDocRef.set).toHaveBeenCalled();
    });

    it('throws error for invalid locales', async () => {
      const {RootCMSClient} = await import('./client.js');
      const {Timestamp} = await import('firebase-admin/firestore');
      const client = new RootCMSClient(mockRootConfig);

      const dataWithInvalidLocales = {
        id: 'Pages/test',
        collection: 'Pages',
        slug: 'test',
        sys: {
          createdAt: Timestamp.now(),
          createdBy: 'user@example.com',
          modifiedAt: Timestamp.now(),
          modifiedBy: 'user@example.com',
          locales: ['en', 123], // Number in array.
        },
        fields: {title: 'Test'},
      };

      await expect(
        client.setRawDoc('Pages', 'test', dataWithInvalidLocales, {
          mode: 'draft',
        })
      ).rejects.toThrow(/Invalid sys\.locales/);
    });

    it('corrects mismatched id, collection, and slug fields', async () => {
      const {RootCMSClient} = await import('./client.js');
      const {Timestamp} = await import('firebase-admin/firestore');
      const client = new RootCMSClient(mockRootConfig);

      const dataWithWrongIds = {
        id: 'Pages/wrong-slug', // Wrong ID.
        collection: 'WrongCollection', // Wrong collection.
        slug: 'wrong-slug', // Wrong slug.
        sys: {
          createdAt: Timestamp.now(),
          createdBy: 'user@example.com',
          modifiedAt: Timestamp.now(),
          modifiedBy: 'user@example.com',
        },
        fields: {title: 'Test'},
      };

      await client.setRawDoc('Pages', 'correct-slug', dataWithWrongIds, {
        mode: 'draft',
      });

      expect(mockDocRef.set).toHaveBeenCalled();
      const savedData = mockDocRef.set.mock.calls[0][0];
      expect(savedData.id).toBe('Pages/correct-slug');
      expect(savedData.collection).toBe('Pages');
      expect(savedData.slug).toBe('correct-slug');
    });

    it('sets id, collection, and slug fields when missing', async () => {
      const {RootCMSClient} = await import('./client.js');
      const {Timestamp} = await import('firebase-admin/firestore');
      const client = new RootCMSClient(mockRootConfig);

      const dataWithMissingIds = {
        // id, collection, and slug are missing.
        sys: {
          createdAt: Timestamp.now(),
          createdBy: 'user@example.com',
          modifiedAt: Timestamp.now(),
          modifiedBy: 'user@example.com',
        },
        fields: {title: 'Test'},
      };

      await client.setRawDoc('Pages', 'test-slug', dataWithMissingIds, {
        mode: 'draft',
      });

      expect(mockDocRef.set).toHaveBeenCalled();
      const savedData = mockDocRef.set.mock.calls[0][0];
      expect(savedData.id).toBe('Pages/test-slug');
      expect(savedData.collection).toBe('Pages');
      expect(savedData.slug).toBe('test-slug');
    });

    it('defaults sys to empty object and adds required fields when sys is missing', async () => {
      const {RootCMSClient} = await import('./client.js');
      const client = new RootCMSClient(mockRootConfig);

      const dataWithoutSys = {
        fields: {title: 'Test'},
      };

      await client.setRawDoc('Pages', 'test', dataWithoutSys, {
        mode: 'draft',
      });

      expect(mockDocRef.set).toHaveBeenCalled();
      const savedData = mockDocRef.set.mock.calls[0][0];
      // Verify sys was created with default values.
      expect(savedData.sys).toBeDefined();
      expect(savedData.sys.createdAt).toBeDefined();
      expect(savedData.sys.modifiedAt).toBeDefined();
      expect(savedData.sys.createdBy).toBe('root-cms-client');
      expect(savedData.sys.modifiedBy).toBe('root-cms-client');
      expect(savedData.sys.locales).toEqual(['en']);
    });

    it('throws error when collectionId is empty', async () => {
      const {RootCMSClient} = await import('./client.js');
      const client = new RootCMSClient(mockRootConfig);

      await expect(
        client.setRawDoc('', 'test-slug', {fields: {}}, {mode: 'draft'})
      ).rejects.toThrow(/collectionId is required/);
    });

    it('throws error when slug is empty', async () => {
      const {RootCMSClient} = await import('./client.js');
      const client = new RootCMSClient(mockRootConfig);

      await expect(
        client.setRawDoc('Pages', '', {fields: {}}, {mode: 'draft'})
      ).rejects.toThrow(/slug is required/);
    });

    it('normalizes slugs with slashes to double dashes', async () => {
      const {RootCMSClient} = await import('./client.js');
      const client = new RootCMSClient(mockRootConfig);

      await client.setRawDoc('Pages', 'parent/child/page', {fields: {}}, {
        mode: 'draft',
      });

      expect(mockDocRef.set).toHaveBeenCalled();
      const savedData = mockDocRef.set.mock.calls[0][0];
      // Verify slug was normalized to use -- instead of /.
      expect(savedData.slug).toBe('parent--child--page');
      expect(savedData.id).toBe('Pages/parent--child--page');
    });
  });

  describe('getRawDoc parameter validation', () => {
    it('throws error when collectionId is empty', async () => {
      const {RootCMSClient} = await import('./client.js');
      const client = new RootCMSClient(mockRootConfig);

      await expect(
        client.getRawDoc('', 'test-slug', {mode: 'draft'})
      ).rejects.toThrow(/collectionId is required/);
    });

    it('throws error when slug is empty', async () => {
      const {RootCMSClient} = await import('./client.js');
      const client = new RootCMSClient(mockRootConfig);

      await expect(
        client.getRawDoc('Pages', '', {mode: 'draft'})
      ).rejects.toThrow(/slug is required/);
    });
  });

  describe('listDocs parameter validation', () => {
    it('throws error when collectionId is empty', async () => {
      const {RootCMSClient} = await import('./client.js');
      const client = new RootCMSClient(mockRootConfig);

      await expect(client.listDocs('', {mode: 'draft'})).rejects.toThrow(
        /collectionId is required/
      );
    });
  });

  describe('getDocsCount parameter validation', () => {
    it('throws error when collectionId is empty', async () => {
      const {RootCMSClient} = await import('./client.js');
      const client = new RootCMSClient(mockRootConfig);

      await expect(client.getDocsCount('', {mode: 'draft'})).rejects.toThrow(
        /collectionId is required/
      );
    });
  });
});
