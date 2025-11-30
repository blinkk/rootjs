import {describe, it, expect} from 'vitest';
import {cleanMarshaledData} from './client.js';
import {setDeepValue} from './mcp.js';

describe('setDeepValue', () => {
  it('sets a simple top-level field', () => {
    const obj = {};
    setDeepValue(obj, 'title', 'Hello World');
    expect(obj).toEqual({title: 'Hello World'});
  });

  it('sets a nested field', () => {
    const obj = {};
    setDeepValue(obj, 'content.title', 'Nested Title');
    expect(obj).toEqual({content: {title: 'Nested Title'}});
  });

  it('sets an array element by index', () => {
    const obj: any = {};
    setDeepValue(obj, 'modules.0.title', 'First Module');
    expect(obj.modules[0].title).toBe('First Module');
  });

  it('sets a deeply nested field', () => {
    const obj = {};
    setDeepValue(obj, 'content.modules.0.hero.title', 'Deep Title');
    expect(obj).toEqual({
      content: {
        modules: [{hero: {title: 'Deep Title'}}],
      },
    });
  });

  it('updates existing fields', () => {
    const obj = {title: 'Old Title', other: 'value'};
    setDeepValue(obj, 'title', 'New Title');
    expect(obj).toEqual({title: 'New Title', other: 'value'});
  });

  it('throws error when expecting array but finding object', () => {
    const obj = {content: {title: 'not an array'}};
    expect(() => {
      setDeepValue(obj, 'content.0.field', 'value');
    }).toThrow('Expected array');
  });

  it('handles multiple array indices', () => {
    const obj: any = {};
    setDeepValue(obj, 'sections.0.items.1.name', 'Item Name');
    expect(obj.sections[0].items[1].name).toBe('Item Name');
  });
});

describe('docs_update reproduction', () => {
  it('cleans _arrayKey after setDeepValue update', () => {
    // Simulate a document with _arrayKey fields (as returned by getDoc/unmarshalData)
    const docFields = {
      content: {
        modules: [
          {
            _type: 'Hero',
            _arrayKey: 'key1',
            title: 'Original Title',
          },
          {
            _type: 'Tabs',
            _arrayKey: 'key2',
            tabs: [
              {
                _arrayKey: 'tab1',
                content: {
                  body: {
                    blocks: [
                      {
                        type: 'paragraph',
                        data: {text: 'Original text'},
                      },
                    ],
                  },
                },
              },
            ],
          },
        ],
      },
    };

    // Simulate the update path from the user request
    const path = 'content.modules.1.tabs.0.content.body.blocks.0.data.text';
    const value = 'Updated text';

    // 1. Update the document in place (mimics docs_update logic)
    setDeepValue(docFields, path, value);

    // 2. Clean the document
    const cleaned = cleanMarshaledData(docFields);

    // 3. Verify _arrayKey fields are gone
    expect(cleaned.content.modules[0]).not.toHaveProperty('_arrayKey');
    expect(cleaned.content.modules[1]).not.toHaveProperty('_arrayKey');
    expect(cleaned.content.modules[1].tabs[0]).not.toHaveProperty('_arrayKey');

    // Verify update persisted
    expect(
      cleaned.content.modules[1].tabs[0].content.body.blocks[0].data.text
    ).toBe('Updated text');
  });
});
