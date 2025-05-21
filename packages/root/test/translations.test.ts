import {render} from '@testing-library/preact';
import {FunctionComponent, h} from 'preact';
import {expect, test, describe, vi} from 'vitest';
import {useTranslations} from '../src/core/hooks/useTranslations';
import {
  TransformationProvider,
  TransformationProviderProps,
} from '../src/core/components/TransformationProvider';
import {I18nContext} from '../src/core/hooks/useI18nContext';
import {PreTranslationFunc, PostTranslationFunc} from '../src/core/types';

// Helper component to test useTranslations hook
const TestComponent: FunctionComponent<{
  stringToTranslate: string;
  params?: Record<string, string | number>;
  providerProps?: Partial<TransformationProviderProps>;
  i18nContextValue?: any;
}> = ({stringToTranslate, params, providerProps, i18nContextValue}) => {
  const t = useTranslations();
  const content = t(stringToTranslate, params);

  if (providerProps) {
    return (
      <I18nContext.Provider value={i18nContextValue || mockI18nContextValue}>
        <TransformationProvider {...providerProps}>
          <div data-testid="translation">{content}</div>
        </TransformationProvider>
      </I18nContext.Provider>
    );
  }

  return (
    <I18nContext.Provider value={i18nContextValue || mockI18nContextValue}>
      <div data-testid="translation">{content}</div>
    </I18nContext.Provider>
  );
};

const mockI18nContextValue = {
  locale: 'en',
  translations: {
    Hello: 'Bonjour',
    'Hello {name}': 'Bonjour {name}',
    'Hello_pre': 'Bonjour_pre',
    'Hello_pre {name}': 'Bonjour_pre {name}',
    'Test String': 'Chaîne de test',
    'Test String_pre': 'Chaîne de test_pre',
    'colour': 'Colour from translation',
    'multiline': 'multi\nline\ntranslation',
    'multiline_pre': 'multi\nline\ntranslation_pre',
  },
  locales: ['en', 'fr'],
};

describe('useTranslations', () => {
  test('returns original string if no translation exists', () => {
    const {getByTestId} = render(
      <TestComponent stringToTranslate="Unknown String" />
    );
    expect(getByTestId('translation').textContent).toBe('Unknown String');
  });

  test('returns translated string if translation exists', () => {
    const {getByTestId} = render(
      <TestComponent stringToTranslate="Hello" />
    );
    expect(getByTestId('translation').textContent).toBe('Bonjour');
  });

  test('handles parameter substitution without transformations', () => {
    const {getByTestId} = render(
      <TestComponent
        stringToTranslate="Hello {name}"
        params={{name: 'Vitest'}}
      />
    );
    expect(getByTestId('translation').textContent).toBe('Bonjour Vitest');
  });

  test('handles multiline strings', () => {
    const {getByTestId} = render(
      <TestComponent stringToTranslate="multiline" />
    );
    expect(getByTestId('translation').textContent).toBe(
      'multi\nline\ntranslation'
    );
  });
});

describe('useTranslations with TransformationProvider (preTranslation)', () => {
  test('preTranslation modifies string before lookup', () => {
    const preTranslation: PreTranslationFunc = (str, locale) => {
      expect(locale).toBe('en');
      return `${str}_pre`;
    };
    const {getByTestId} = render(
      // Intentionally NOT passing i18nContextValue to TestComponent
      // so it uses the mockI18nContextValue defined in the file.
      <TransformationProvider preTranslation={preTranslation}>
        <TestComponent stringToTranslate="Hello" />
      </TransformationProvider>
    );
    expect(getByTestId('translation').textContent).toBe('Bonjour_pre');
  });

  test('preTranslation handles params correctly', () => {
    const preTranslation: PreTranslationFunc = (str, locale) => {
      expect(locale).toBe('en');
      return `${str}_pre`;
    };
    const {getByTestId} = render(
      <TransformationProvider preTranslation={preTranslation}>
        <TestComponent
          stringToTranslate="Hello {name}"
          params={{name: 'Vitest'}}
        />
      </TransformationProvider>
    );
    expect(getByTestId('translation').textContent).toBe('Bonjour_pre Vitest');
  });

  test('preTranslation works with different locale', () => {
    const preTranslation: PreTranslationFunc = (str, locale) => {
      expect(locale).toBe('fr');
      return `${str}_pre_fr`; // Assuming specific fr pre-translation logic
    };
    const i18nContextValueFr = {
      ...mockI18nContextValue,
      locale: 'fr',
      translations: {
        ...mockI18nContextValue.translations,
        Hello_pre_fr: 'Salut_pre_fr', // French pre-translated string
      },
    };
    const {getByTestId} = render(
      <I18nContext.Provider value={i18nContextValueFr}>
        <TransformationProvider preTranslation={preTranslation}>
          <TestComponent stringToTranslate="Hello" />
        </TransformationProvider>
      </I18nContext.Provider>
    );
    expect(getByTestId('translation').textContent).toBe('Salut_pre_fr');
  });

  test('preTranslation uses original string if not in translations', () => {
    const preTranslation: PreTranslationFunc = (str) => `${str}_pre_unknown`;
     const {getByTestId} = render(
      <TransformationProvider preTranslation={preTranslation}>
        <TestComponent stringToTranslate="Unknown String" />
      </TransformationProvider>
    );
    // preTranslation runs, but "Unknown String_pre_unknown" is not in translations
    expect(getByTestId('translation').textContent).toBe('Unknown String_pre_unknown');
  });
});

describe('useTranslations with TransformationProvider (postTranslation)', () => {
  test('postTranslation modifies string after lookup and param substitution', () => {
    const postTranslation: PostTranslationFunc = (
      translatedStr,
      params,
      locale
    ) => {
      expect(locale).toBe('en');
      expect(params).toEqual({name: 'Vitest'});
      return `${translatedStr}_post`;
    };
    const {getByTestId} = render(
      <TransformationProvider postTranslation={postTranslation}>
        <TestComponent
          stringToTranslate="Hello {name}"
          params={{name: 'Vitest'}}
        />
      </TransformationProvider>
    );
    expect(getByTestId('translation').textContent).toBe('Bonjour Vitest_post');
  });

  test('postTranslation handles string without params', () => {
    const postTranslation: PostTranslationFunc = (
      translatedStr,
      params,
      locale
    ) => {
      expect(locale).toBe('en');
      expect(params).toBeUndefined();
      return `${translatedStr}_post_no_params`;
    };
    const {getByTestId} = render(
      <TransformationProvider postTranslation={postTranslation}>
        <TestComponent stringToTranslate="Hello" />
      </TransformationProvider>
    );
    expect(getByTestId('translation').textContent).toBe(
      'Bonjour_post_no_params'
    );
  });

  test('postTranslation for reformatting params (footnote)', () => {
    const postTranslation: PostTranslationFunc = (translatedStr) => {
      return translatedStr.replace(/\[footnote:([^\]]+)\]/g, '<sup>$1</sup>');
    };
    const {getByTestId} = render(
      <TransformationProvider postTranslation={postTranslation}>
        <TestComponent
          stringToTranslate="See details[footnote:1]"
          i18nContextValue={{
            ...mockI18nContextValue,
            translations: {
              'See details[footnote:1]': 'Voir détails[footnote:1]',
            },
          }}
        />
      </TransformationProvider>
    );
    expect(getByTestId('translation').innerHTML).toBe(
      'Voir détails<sup>1</sup>'
    );
  });

  test('postTranslation for injecting &nbsp;', () => {
    const postTranslation: PostTranslationFunc = (translatedStr, params) => {
      if (params?.textToNbsp) {
        return translatedStr.replace(
          String(params.textToNbsp),
          String(params.textToNbsp).replace(/ /g, '&nbsp;')
        );
      }
      return translatedStr;
    };
    const {getByTestId} = render(
      <TransformationProvider postTranslation={postTranslation}>
        <TestComponent
          stringToTranslate="Text: {textToNbsp}"
          params={{textToNbsp: 'Root CMS'}}
          i18nContextValue={{
            ...mockI18nContextValue,
            translations: {
              'Text: {textToNbsp}': 'Texte: {textToNbsp}',
            },
          }}
        />
      </TransformationProvider>
    );
    expect(getByTestId('translation').innerHTML).toBe(
      'Texte: Root&nbsp;CMS'
    );
  });

  test('postTranslation works with different locale', () => {
    const postTranslation: PostTranslationFunc = (
      translatedStr,
      params,
      locale
    ) => {
      expect(locale).toBe('fr');
      return `${translatedStr}_post_fr`;
    };
    const i18nContextValueFr = {
      ...mockI18nContextValue,
      locale: 'fr',
      translations: {
        ...mockI18nContextValue.translations,
        Hello: 'Salut', // French translation
      },
    };
    const {getByTestId} = render(
      <I18nContext.Provider value={i18nContextValueFr}>
        <TransformationProvider postTranslation={postTranslation}>
          <TestComponent stringToTranslate="Hello" />
        </TransformationProvider>
      </I18nContext.Provider>
    );
    expect(getByTestId('translation').textContent).toBe('Salut_post_fr');
  });

  test('postTranslation uses original string if not in translations', () => {
    const postTranslation: PostTranslationFunc = (str) => `${str}_post_unknown`;
    const {getByTestId} = render(
      <TransformationProvider postTranslation={postTranslation}>
        <TestComponent stringToTranslate="Unknown String" />
      </TransformationProvider>
    );
    // postTranslation runs on the original string as it's not in translations
    expect(getByTestId('translation').textContent).toBe('Unknown String_post_unknown');
  });
});

describe('useTranslations with TransformationProvider (pre and postTranslation)', () => {
  test('pre and postTranslation both applied', () => {
    const preTranslation: PreTranslationFunc = (str, locale) => {
      expect(locale).toBe('en');
      return `${str}_pre`;
    };
    const postTranslation: PostTranslationFunc = (
      translatedStr,
      params,
      locale
    ) => {
      expect(locale).toBe('en');
      expect(params).toEqual({name: 'Vitest'});
      return `${translatedStr}_post`;
    };

    const {getByTestId} = render(
      <TransformationProvider
        preTranslation={preTranslation}
        postTranslation={postTranslation}
      >
        <TestComponent
          stringToTranslate="Hello {name}"
          params={{name: 'Vitest'}}
        />
      </TransformationProvider>
    );
    // "Hello {name}" -> "Hello {name}_pre" (preTranslation)
    // "Hello {name}_pre" is looked up -> "Bonjour_pre {name}"
    // "Bonjour_pre Vitest" (param substitution)
    // "Bonjour_pre Vitest" -> "Bonjour_pre Vitest_post" (postTranslation)
    expect(getByTestId('translation').textContent).toBe(
      'Bonjour_pre Vitest_post'
    );
  });

  test('pre and postTranslation with different locales', () => {
    const preTranslation: PreTranslationFunc = (str, locale) => {
      expect(locale).toBe('fr');
      return `${str}_pre_fr`;
    };
    const postTranslation: PostTranslationFunc = (
      translatedStr,
      params,
      locale
    ) => {
      expect(locale).toBe('fr');
      return `${translatedStr}_post_fr`;
    };

    const i18nContextValueFr = {
      locale: 'fr',
      translations: {
        'Hello_pre_fr': 'Salut_pre_fr',
      },
      locales: ['en', 'fr'],
    };

    const {getByTestId} = render(
      <I18nContext.Provider value={i18nContextValueFr}>
        <TransformationProvider
          preTranslation={preTranslation}
          postTranslation={postTranslation}
        >
          <TestComponent stringToTranslate="Hello" />
        </TransformationProvider>
      </I18nContext.Provider>
    );
    // "Hello" -> "Hello_pre_fr" (preTranslation with 'fr' locale)
    // "Hello_pre_fr" is looked up -> "Salut_pre_fr"
    // "Salut_pre_fr" -> "Salut_pre_fr_post_fr" (postTranslation with 'fr' locale)
    expect(getByTestId('translation').textContent).toBe(
      'Salut_pre_fr_post_fr'
    );
  });

  test('default identity functions if no provider', () => {
    const {getByTestId} = render(
      // No TransformationProvider, so default identity functions should be used
      <TestComponent
        stringToTranslate="Hello {name}"
        params={{name: 'Vitest'}}
      />
    );
    expect(getByTestId('translation').textContent).toBe('Bonjour Vitest');
  });

  test('default identity functions if provider has no props', () => {
    const {getByTestId} = render(
      <TransformationProvider>
        <TestComponent
          stringToTranslate="Hello {name}"
          params={{name: 'Vitest'}}
        />
      </TransformationProvider>
    );
    expect(getByTestId('translation').textContent).toBe('Bonjour Vitest');
  });

  test('only preTranslation provided', () => {
    const preTranslation: PreTranslationFunc = (str) => `${str}_pre_only`;
    const {getByTestId} = render(
      <TransformationProvider preTranslation={preTranslation}>
        <TestComponent stringToTranslate="Hello" />
      </TransformationProvider>
    );
    // "Hello" -> "Hello_pre_only"
    // "Hello_pre_only" not in translations, so it's returned as is
    // Default postTranslation is identity
    expect(getByTestId('translation').textContent).toBe('Hello_pre_only');
  });

  test('only postTranslation provided', () => {
    const postTranslation: PostTranslationFunc = (str) => `${str}_post_only`;
    const {getByTestId} = render(
      <TransformationProvider postTranslation={postTranslation}>
        <TestComponent stringToTranslate="Hello" />
      </TransformationProvider>
    );
    // "Hello" -> "Bonjour" (translation)
    // "Bonjour" -> "Bonjour_post_only" (postTranslation)
    expect(getByTestId('translation').textContent).toBe('Bonjour_post_only');
  });
});
