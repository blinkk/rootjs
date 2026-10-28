import {describe, expect, it} from 'vitest';
import {diffDocLocales} from './doc-diff.js';

function doc(locales?: string[]) {
  return {sys: {locales}};
}

describe('diffDocLocales', () => {
  it('returns null when locales are the same', () => {
    expect(diffDocLocales(doc(['en', 'es']), doc(['en', 'es']))).toBeNull();
  });

  it('ignores locale order', () => {
    expect(diffDocLocales(doc(['en', 'es']), doc(['es', 'en']))).toBeNull();
  });

  it('treats missing locales as the default', () => {
    expect(diffDocLocales(doc(), doc(['en']))).toBeNull();
    expect(diffDocLocales(doc(), doc(['en', 'fr']))).toEqual({
      added: ['fr'],
      removed: [],
      unchanged: ['en'],
    });
  });

  it('returns added, removed, and unchanged locales', () => {
    expect(
      diffDocLocales(doc(['en', 'de', 'es']), doc(['fr', 'es', 'en']))
    ).toEqual({
      added: ['fr'],
      removed: ['de'],
      unchanged: ['en', 'es'],
    });
  });

  it('treats a missing doc as having no locales', () => {
    expect(diffDocLocales(null, doc(['en', 'es']))).toEqual({
      added: ['en', 'es'],
      removed: [],
      unchanged: [],
    });
    expect(diffDocLocales(null, null)).toBeNull();
  });
});
