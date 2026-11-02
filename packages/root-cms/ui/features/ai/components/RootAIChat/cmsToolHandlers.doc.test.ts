import {beforeEach, describe, expect, it, vi} from 'vitest';
import {executeCmsTool, previewCmsWriteTool} from './cmsToolHandlers.js';

const mocks = vi.hoisted(() => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  fetchCollectionSchema: vi.fn(),
}));

vi.mock('firebase/firestore', () => {
  class MockTimestamp {
    constructor(public millis: number) {}
    get seconds() {
      return Math.floor(this.millis / 1000);
    }
    get nanoseconds() {
      return 0;
    }
    toMillis() {
      return this.millis;
    }
    static fromMillis(millis: number) {
      return new MockTimestamp(millis);
    }
  }
  return {
    deleteField: vi.fn(),
    doc: mocks.doc,
    getDoc: mocks.getDoc,
    serverTimestamp: () => '__SERVER_TIMESTAMP__',
    setDoc: mocks.setDoc,
    updateDoc: mocks.updateDoc,
    Timestamp: MockTimestamp,
  };
});

vi.mock('../../../releases/release.js', () => ({}));
vi.mock('../../../users/useProjectRoles.js', () => ({}));
vi.mock('../../../logs/actions.js', () => ({logAction: vi.fn()}));
vi.mock('../../../collections/collection.js', () => ({
  fetchCollectionSchema: mocks.fetchCollectionSchema,
}));

const SCHEMA = {
  name: 'Pages',
  fields: [
    {id: 'title', type: 'string'},
    {id: 'launch', type: 'datetime'},
    {id: 'day', type: 'date'},
    {id: 'tags', type: 'multiselect'},
    {id: 'image', type: 'image'},
    {id: 'modules', type: 'array', of: {type: 'oneof', types: ['Hero']}},
  ],
  types: {
    Hero: {
      name: 'Hero',
      fields: [
        {id: 'title', type: 'string'},
        {id: 'body', type: 'richtext'},
      ],
    },
  },
};

let draft: any;

beforeEach(async () => {
  vi.clearAllMocks();
  const {Timestamp} = await import('firebase/firestore');
  draft = {
    sys: {},
    fields: {
      title: 'Hello',
      launch: Timestamp.fromMillis(1700000000000),
      day: '2026-01-01',
      tags: ['a'],
      modules: {
        _array: ['abc', 'xyz'],
        abc: {_type: 'Hero', title: 'First'},
        xyz: {_type: 'Hero', title: 'Second'},
      },
    },
  };
  mocks.doc.mockReturnValue({});
  mocks.getDoc.mockImplementation(async () => ({
    exists: () => Boolean(draft),
    data: () => draft,
  }));
  mocks.fetchCollectionSchema.mockResolvedValue(SCHEMA);
  (window as any).__ROOT_CTX = {
    rootConfig: {projectId: 'test'},
    collections: {Pages: {}},
  };
  (window as any).firebase = {db: {}, user: {email: 'a@example.com'}};
});

describe('doc_updateField', () => {
  it('writes to the stored key of an array item', async () => {
    const result: any = await executeCmsTool('doc_updateField', {
      docId: 'Pages/home',
      path: 'modules.1.title',
      value: 'Updated',
    });
    expect(result.success).toBe(true);
    expect(mocks.updateDoc.mock.calls[0][1]).toMatchObject({
      'fields.modules.xyz.title': 'Updated',
    });
  });

  it('never writes an index as a key for an item that does not exist', async () => {
    const result: any = await executeCmsTool('doc_updateField', {
      docId: 'Pages/home',
      path: 'modules.5.title',
      value: 'Updated',
    });
    expect(result.success).toBe(false);
    expect(mocks.updateDoc).not.toHaveBeenCalled();
  });

  it('replaces numeric keys in stored data', async () => {
    draft.fields.modules = {
      _array: ['0'],
      0: {_type: 'Hero', title: 'First'},
    };
    const result: any = await executeCmsTool('doc_updateField', {
      docId: 'Pages/home',
      path: 'modules.0.title',
      value: 'Updated',
    });
    expect(result.success).toBe(true);
    const {fields} = mocks.updateDoc.mock.calls[0][1];
    const [key] = fields.modules._array;
    expect(key).not.toMatch(/^\d+$/);
    expect(fields.modules[key].title).toBe('Updated');
  });

  it('validates fields inside of oneOf types', async () => {
    const result: any = await executeCmsTool('doc_updateField', {
      docId: 'Pages/home',
      path: 'modules.0.body',
      value: {blocks: [{type: 'heading', data: {level: 'x'}}]},
    });
    expect(result).toMatchObject({success: false, error: 'VALIDATION_FAILED'});
    expect(mocks.updateDoc).not.toHaveBeenCalled();
  });

  it('rejects invalid values nested in a structured field', async () => {
    const result: any = await executeCmsTool('doc_updateField', {
      docId: 'Pages/home',
      path: 'image',
      value: {alt: 'no src'},
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields', async () => {
    const result: any = await executeCmsTool('doc_updateField', {
      docId: 'Pages/home',
      path: 'titel',
      value: 'Typo',
    });
    expect(result.success).toBe(false);
    expect(mocks.updateDoc).not.toHaveBeenCalled();
  });
});

describe('doc_edit', () => {
  it('keeps timestamps, array keys and plain arrays', async () => {
    const {Timestamp} = await import('firebase/firestore');
    const result: any = await executeCmsTool('doc_edit', {
      docId: 'Pages/home',
      operations: [{op: 'set', path: 'title', value: 'New'}],
    });
    expect(result.success).toBe(true);
    const {fields} = mocks.updateDoc.mock.calls[0][1];
    expect(fields.title).toBe('New');
    expect(fields.launch).toBeInstanceOf(Timestamp);
    expect(fields.day).toBe('2026-01-01');
    expect(fields.tags).toEqual(['a']);
    expect(fields.modules._array).toEqual(['abc', 'xyz']);
  });

  it('shows no phantom changes in the approval preview', async () => {
    const preview = await previewCmsWriteTool('doc_edit', {
      docId: 'Pages/home',
      operations: [{op: 'set', path: 'title', value: 'New'}],
    });
    expect(preview.error).toBeUndefined();
    expect(preview.after).toEqual({...(preview.before as any), title: 'New'});
  });

  it('gives a copied item its own key', async () => {
    await executeCmsTool('doc_edit', {
      docId: 'Pages/home',
      operations: [
        {
          op: 'insert_item',
          path: 'modules',
          value: {_type: 'Hero', title: 'Copy', _arrayKey: 'abc'},
        },
      ],
    });
    const {modules} = mocks.updateDoc.mock.calls[0][1].fields;
    expect(new Set(modules._array).size).toBe(3);
    expect(modules[modules._array[2]].title).toBe('Copy');
    expect(modules.abc.title).toBe('First');
  });
});

describe('doc_set', () => {
  it('repairs the value, and reports it to the model', async () => {
    const result: any = await executeCmsTool('doc_set', {
      docId: 'Pages/home',
      fields: {
        title: 'New',
        modules: {0: {_type: 'Hero', body: 'Some text'}},
      },
    });
    expect(result.success).toBe(true);
    expect(result.repairs.length).toBeGreaterThan(0);
    const {modules} = mocks.setDoc.mock.calls[0][1].fields;
    const [key] = modules._array;
    expect(key).not.toMatch(/^\d+$/);
    expect(modules[key].body.blocks).toEqual([
      {type: 'paragraph', data: {text: 'Some text'}},
    ]);
  });

  it('never replaces a doc with a non-object', async () => {
    const result: any = await executeCmsTool('doc_set', {
      docId: 'Pages/home',
      fields: null,
    });
    expect(result.success).toBe(false);
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });
});

describe('doc_create', () => {
  it('rejects a slug and collection the CMS would not accept', async () => {
    draft = null;
    const badSlug: any = await executeCmsTool('doc_create', {
      docId: 'Pages/Not Valid',
    });
    expect(badSlug.error).toBe('INVALID_SLUG');
    const badCollection: any = await executeCmsTool('doc_create', {
      docId: 'Nope/foo',
    });
    expect(badCollection.error).toBe('INVALID_COLLECTION');
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });
});
