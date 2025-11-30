import {Timestamp} from 'firebase-admin/firestore';
import {describe, it, expect, vi, beforeEach} from 'vitest';
import {marshalData, applySchemaConversions, RootCMSClient} from './client.js';
import {Schema} from './schema.js';

// Mock Firebase Admin
vi.mock('firebase-admin/app', () => ({
  App: class {},
}));

vi.mock('firebase-admin/firestore', () => {
  class MockTimestamp {
    millis: number;
    constructor(millis: number) {
      this.millis = millis;
    }
    toMillis() {
      return this.millis;
    }
    static now() {
      return new MockTimestamp(Date.now());
    }
    static fromMillis(millis: number) {
      return new MockTimestamp(millis);
    }
  }

  const firestore = {
    doc: vi.fn(),
    collection: vi.fn(),
    runTransaction: vi.fn(),
    batch: vi.fn(),
  };

  return {
    Firestore: vi.fn(() => firestore),
    FieldValue: {
      serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
      delete: vi.fn(() => 'DELETE_FIELD'),
    },
    Timestamp: MockTimestamp,
    FieldPath: {
      documentId: vi.fn(),
    },
  };
});

// Mock tiny-glob
vi.mock('tiny-glob', () => ({
  default: vi.fn(),
}));

describe('client', () => {
  describe('marshalData', () => {
    it('preserves Timestamps', () => {
      const ts = Timestamp.now();
      const data = {
        time: ts,
        nested: {
          time: ts,
        },
      };
      const marshaled = marshalData(data);
      expect(marshaled.time).toBe(ts);
      expect(marshaled.nested.time).toBe(ts);
    });

    it('marshals arrays', () => {
      const data = {
        tags: ['a', 'b'],
        items: [{id: 1}, {id: 2}],
      };
      const marshaled = marshalData(data);
      expect(marshaled.tags).toEqual(['a', 'b']);
      expect(marshaled.items._array).toHaveLength(2);
      expect(marshaled.items[marshaled.items._array[0]].id).toBe(1);
    });
  });

  describe('applySchemaConversions', () => {
    it('converts datetime numbers to Timestamps', () => {
      const schema: Schema = {
        name: 'Test',
        fields: [
          {type: 'datetime', id: 'publishedAt'},
          {type: 'string', id: 'title'},
        ],
      };
      const data = {
        publishedAt: 1630000000000,
        title: 'Hello',
      };
      const converted = applySchemaConversions(data, schema);
      expect(converted.publishedAt).toBeInstanceOf(Timestamp);
      expect(converted.publishedAt.toMillis()).toBe(1630000000000);
      expect(converted.title).toBe('Hello');
    });

    it('handles nested objects', () => {
      const schema: Schema = {
        name: 'Test',
        fields: [
          {
            type: 'object',
            id: 'meta',
            fields: [{type: 'datetime', id: 'updatedAt'}],
          },
        ],
      };
      const data = {
        meta: {
          updatedAt: 1630000000000,
        },
      };
      const converted = applySchemaConversions(data, schema);
      expect(converted.meta.updatedAt).toBeInstanceOf(Timestamp);
      expect(converted.meta.updatedAt.toMillis()).toBe(1630000000000);
    });

    it('handles arrays of objects', () => {
      const schema: Schema = {
        name: 'Test',
        fields: [
          {
            type: 'array',
            id: 'items',
            of: {
              type: 'object',
              fields: [{type: 'datetime', id: 'date'}],
            },
          },
        ],
      };
      const data = {
        items: [{date: 1630000000000}, {date: 1630000001000}],
      };
      const converted = applySchemaConversions(data, schema);
      expect(converted.items[0].date).toBeInstanceOf(Timestamp);
      expect(converted.items[1].date).toBeInstanceOf(Timestamp);
    });

    it('handles arrays of oneOf fields', () => {
      const subSchema: Schema = {
        name: 'MyType',
        fields: [{type: 'datetime', id: 'date'}],
      };
      const schema: Schema = {
        name: 'Test',
        fields: [
          {
            type: 'array',
            id: 'modules',
            of: {
              type: 'oneof',
              types: [subSchema],
            },
          },
        ],
      };
      const data = {
        modules: [{_type: 'MyType', date: 1630000000000}],
      };
      const converted = applySchemaConversions(data, schema);
      expect(converted.modules[0].date).toBeInstanceOf(Timestamp);
    });

    it('handles oneOf fields with string references', () => {
      const subSchema: Schema = {
        name: 'MyType',
        fields: [{type: 'datetime', id: 'date'}],
      };
      const schema: Schema = {
        name: 'Test',
        fields: [
          {
            type: 'oneof',
            id: 'content',
            types: ['MyType'],
          },
        ],
      };
      const data = {
        content: {_type: 'MyType', date: 1630000000000},
      };
      const getSchema = (id: string) =>
        id === 'MyType' ? subSchema : undefined;
      const converted = applySchemaConversions(data, schema, getSchema);
      expect(converted.content.date).toBeInstanceOf(Timestamp);
    });
  });
});

describe('RootCMSClient Release Management', () => {
  let client: RootCMSClient;
  let mockDb: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create client instance with mocked dependencies
    const mockConfig = {
      rootDir: '/test/project',
      projectId: 'test-project',
      plugins: [
        {
          name: 'root-cms',
          getConfig: () => ({id: 'test-project'}),
          getFirebaseApp: () => ({}),
          getFirestore: () => ({
            doc: vi.fn(),
            collection: vi.fn(),
            runTransaction: vi.fn(),
            batch: vi.fn(),
          }),
        },
      ],
    } as any;
    client = new RootCMSClient(mockConfig);
    mockDb = (client as any).db;

    // Mock db methods
    mockDb.doc.mockReturnValue({
      get: vi.fn(),
      set: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    });
    mockDb.collection.mockReturnValue({
      orderBy: vi.fn().mockReturnThis(),
      get: vi.fn(),
    });
    mockDb.batch.mockReturnValue({
      set: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      commit: vi.fn(),
    });
    mockDb.runTransaction.mockImplementation(async (cb: any) => {
      const t = {
        get: vi.fn(),
        set: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      };
      await cb(t);
    });

    // Mock logAction to avoid errors
    (client as any).logAction = vi.fn();
  });

  describe('createRelease', () => {
    it('creates a new release', async () => {
      const releaseId = 'test-release';
      const releaseData = {description: 'Test Release'};

      // Mock transaction get to return non-existent doc
      const mockTransaction = {
        get: vi.fn().mockResolvedValue({exists: false}),
        set: vi.fn(),
      };
      mockDb.runTransaction.mockImplementation(async (cb: any) => {
        await cb(mockTransaction);
      });

      await client.createRelease(releaseId, releaseData);

      expect(mockTransaction.get).toHaveBeenCalled();
      expect(mockTransaction.set).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          id: releaseId,
          description: 'Test Release',
          createdBy: 'root-cms-client',
        })
      );
    });

    it('throws error if release exists', async () => {
      const releaseId = 'existing-release';
      const mockTransaction = {
        get: vi.fn().mockResolvedValue({exists: true}),
      };
      mockDb.runTransaction.mockImplementation(async (cb: any) => {
        await cb(mockTransaction);
      });

      await expect(client.createRelease(releaseId, {})).rejects.toThrow(
        `release exists: ${releaseId}`
      );
    });
  });

  describe('getRelease', () => {
    it('returns release data if exists', async () => {
      const releaseId = 'test-release';
      const mockData = {id: releaseId, description: 'Test'};
      const mockDoc = {
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => mockData,
        }),
      };
      mockDb.doc.mockReturnValue(mockDoc);

      const result = await client.getRelease(releaseId);
      expect(result).toEqual(mockData);
    });

    it('returns null if release does not exist', async () => {
      const mockDoc = {
        get: vi.fn().mockResolvedValue({exists: false}),
      };
      mockDb.doc.mockReturnValue(mockDoc);

      const result = await client.getRelease('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('updateRelease', () => {
    it('updates release data', async () => {
      const releaseId = 'test-release';
      const updateData = {description: 'Updated'};
      const mockDoc = {update: vi.fn()};
      mockDb.doc.mockReturnValue(mockDoc);

      await client.updateRelease(releaseId, updateData);
      expect(mockDoc.update).toHaveBeenCalledWith(updateData);
    });
  });

  describe('deleteRelease', () => {
    it('deletes release', async () => {
      const releaseId = 'test-release';
      const mockDoc = {delete: vi.fn()};
      mockDb.doc.mockReturnValue(mockDoc);

      await client.deleteRelease(releaseId);
      expect(mockDoc.delete).toHaveBeenCalled();
    });
  });

  describe('scheduleRelease', () => {
    it('updates scheduledAt and scheduledBy', async () => {
      const releaseId = 'test-release';
      const timestamp = 1234567890000;

      // Mock getRelease
      vi.spyOn(client, 'getRelease').mockResolvedValue({id: releaseId});

      const mockDoc = {update: vi.fn()};
      mockDb.doc.mockReturnValue(mockDoc);

      await client.scheduleRelease(releaseId, timestamp);

      expect(mockDoc.update).toHaveBeenCalledWith(
        expect.objectContaining({
          scheduledBy: 'root-cms-client',
        })
      );
    });
  });

  describe('unscheduleRelease', () => {
    it('removes scheduledAt and scheduledBy', async () => {
      const releaseId = 'test-release';

      // Mock getRelease
      vi.spyOn(client, 'getRelease').mockResolvedValue({id: releaseId});

      const mockDoc = {update: vi.fn()};
      mockDb.doc.mockReturnValue(mockDoc);

      await client.unscheduleRelease(releaseId);

      expect(mockDoc.update).toHaveBeenCalledWith(
        expect.objectContaining({
          scheduledBy: 'DELETE_FIELD',
        })
      );
    });
  });

  describe('listCollections', () => {
    it('returns sorted collection IDs from schema files', async () => {
      // Import glob to access the mock
      const glob = (await import('tiny-glob')).default;

      // Mock glob to return schema files
      vi.mocked(glob).mockResolvedValue([
        'Pages.schema.ts',
        'Posts.schema.ts',
        'Authors.schema.ts',
      ]);

      const result = await client.listCollections();

      expect(result).toEqual(['Authors', 'Pages', 'Posts']);
      expect(glob).toHaveBeenCalledWith('*.schema.ts', {
        cwd: expect.stringContaining('collections'),
      });
    });

    it('returns empty array when no schema files found', async () => {
      const glob = (await import('tiny-glob')).default;
      vi.mocked(glob).mockResolvedValue([]);

      const result = await client.listCollections();

      expect(result).toEqual([]);
    });

    it('strips .schema.ts extension from filenames', async () => {
      const glob = (await import('tiny-glob')).default;
      vi.mocked(glob).mockResolvedValue(['my-custom-collection.schema.ts']);

      const result = await client.listCollections();

      expect(result).toEqual(['my-custom-collection']);
    });
  });
});
