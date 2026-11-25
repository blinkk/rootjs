import {renderToString} from 'preact-render-to-string';
import {describe, expect, it} from 'vitest';
import {I18N_CONTEXT} from './useI18nContext.js';
import {StringParamsProvider} from './useStringParams.js';
import {normalizeString, useTranslations} from './useTranslations.js';
import {TranslationMiddlewareProvider} from './useTranslationsMiddleware.js';

describe('normalizeString', () => {
  it('preserves clean single-line strings and Unicode text', () => {
    expect(normalizeString('Learn more')).toBe('Learn more');
    expect(normalizeString('Hello;')).toBe('Hello;');
    expect(normalizeString('Café')).toBe('Café');
    expect(normalizeString('日本語')).toBe('日本語');
    expect(normalizeString('')).toBe('');
  });

  it('trims ASCII and Unicode whitespace and trailing &nbsp;', () => {
    expect(normalizeString('  Learn more  ')).toBe('Learn more');
    expect(normalizeString('\u00A0Hello\u00A0')).toBe('Hello');
    expect(normalizeString('\u3000Hello\uFEFF')).toBe('Hello');
    expect(normalizeString('Hello&nbsp;')).toBe('Hello');
    expect(normalizeString('Hello &nbsp;  ')).toBe('Hello ');
    expect(normalizeString('\n  Hello  \n')).toBe('Hello');
  });

  it('strips trailing whitespace and &nbsp; on each line of multi-line strings', () => {
    expect(normalizeString('  Line 1  \nLine 2&nbsp;\nLine 3 \t ')).toBe(
      'Line 1\nLine 2\nLine 3'
    );
  });
});

describe('useTranslations', () => {
  it('translates strings and merges context and call-site params', () => {
    function Sample() {
      const t = useTranslations();
      return (
        <div>
          <span>{t('Learn more')}</span>
          <span>{t('Hello {name}, welcome to {site}', {name: 'Ada'})}</span>
          <span>{t('Welcome to {site}')}</span>
          <span>{t('Hello {name}', {name: 'Grace'})}</span>
        </div>
      );
    }

    const html = renderToString(
      <I18N_CONTEXT.Provider
        value={{
          locale: 'fr',
          translations: {
            'Learn more': 'En savoir plus',
            'Hello {name}, welcome to {site}':
              'Bonjour {name}, bienvenue sur {site}',
          },
        }}
      >
        <StringParamsProvider value={{site: 'Root.js', name: 'Default'}}>
          <Sample />
        </StringParamsProvider>
      </I18N_CONTEXT.Provider>
    );

    expect(html).toBe(
      '<div>' +
        '<span>En savoir plus</span>' +
        '<span>Bonjour Ada, bienvenue sur Root.js</span>' +
        '<span>Welcome to Root.js</span>' +
        '<span>Hello Grace</span>' +
        '</div>'
    );
  });

  it('replaces call-site params without StringParamsProvider and runs middleware', () => {
    function Sample() {
      const t = useTranslations();
      return <p>{t('Hello {name}', {name: 'Bob'})}</p>;
    }

    const html = renderToString(
      <I18N_CONTEXT.Provider
        value={{locale: 'en', translations: {'hello {name}': 'Hi {name}!'}}}
      >
        <TranslationMiddlewareProvider
          value={{
            beforeTranslate: (s) => s.toLowerCase(),
            afterReplaceParams: (s) => `[${s}]`,
          }}
        >
          <Sample />
        </TranslationMiddlewareProvider>
      </I18N_CONTEXT.Provider>
    );

    expect(html).toBe('<p>[Hi Bob!]</p>');
  });
});
