import {useEffect, useState} from 'preact/hooks';
import {Layout} from '../../../../app/layout/Layout.js';
import {Heading} from '../../../../components/Heading/Heading.js';
import {usePageTitle} from '../../../../hooks/usePageTitle.js';
import {Breadcrumbs} from '../../../../primitives/Breadcrumbs/Breadcrumbs.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {MultiSelect} from '../../../../primitives/MultiSelect/MultiSelect.js';
import {Spinner} from '../../../../primitives/Spinner/Spinner.js';
import {Textarea} from '../../../../primitives/Textarea/Textarea.js';
import {TextInput} from '../../../../primitives/TextInput/TextInput.js';
import {showNotification} from '../../../../primitives/Toast/toastStore.js';
import {notifyErrors} from '../../../../utils/notifications.js';
import {withTimeout} from '../../../../utils/with-timeout.js';
import {
  Translation,
  getTranslationByHash,
  getTranslationForLanguage,
  normalizeString,
  toTranslationLanguages,
  updateTranslationByHash,
} from '../../l10n.js';

interface TranslationsEditPageProps {
  hash: string;
}

export function TranslationsEditPage(props: TranslationsEditPageProps) {
  usePageTitle('Edit Translation');
  const hash = props.hash;
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [translations, setTranslations] = useState<Translation>({source: ''});

  async function init() {
    setLoading(true);
    await notifyErrors(async () => {
      const translations = await withTimeout(
        getTranslationByHash(hash),
        undefined,
        'loading the translation'
      );
      if (!translations?.source) {
        setNotFound(true);
        return;
      }
      setTranslations(translations);
    });
    setLoading(false);
  }

  async function onChange(newTranslations: Translation) {
    console.log(newTranslations);
    await updateTranslationByHash(hash, newTranslations);
    setTranslations((translations) => {
      return {
        ...translations,
        ...newTranslations,
      };
    });
    showNotification({
      title: 'Saved translations',
      message: `Updated translations for ${hash}.`,
      autoClose: 5000,
    });
  }

  useEffect(() => {
    init();
  }, [props.hash]);

  return (
    <Layout>
      <div className="TranslationsEditPage px-4 pb-4 pt-6 md:p-15 md:pt-12">
        <div className="TranslationsEditPage__header mb-8">
          <Breadcrumbs
            className="TranslationsEditPage__headerBreadcrumbs mb-3"
            items={[
              {label: 'Translations', href: '/cms/translations'},
              {label: props.hash},
            ]}
          />
          <Heading size="h1">Edit Translations</Heading>
        </div>
        {loading ? (
          <Spinner size="lg" className="text-muted" />
        ) : notFound ? (
          <div className="TranslationsEditPage__notFound text-base font-medium">
            Not Found
          </div>
        ) : (
          <TranslationsEditPage.Form
            hash={props.hash}
            translations={translations}
            onChange={onChange}
          />
        )}
      </div>
    </Layout>
  );
}

interface TranslationsEditPagePropsForm {
  hash: string;
  translations: Translation;
  onChange: (newTranslations: Translation) => void | Promise<void>;
}

TranslationsEditPage.Form = (props: TranslationsEditPagePropsForm) => {
  const translations = props.translations;
  const locales = window.__ROOT_CTX.rootConfig.i18n.locales || [];
  // Fields are keyed by "translation language", which may be shared by
  // multiple root locales (per the `i18n.translationLanguages` config).
  const nonEnLocales = toTranslationLanguages(locales).filter(
    (l) => l !== 'en'
  );
  const [tags, setTags] = useState<string[]>(translations.tags || []);
  const [saving, setSaving] = useState<'translations' | 'tags' | null>(null);

  useEffect(() => {
    setTags(translations.tags || []);
  }, [translations.tags]);

  return (
    <div className="TranslationsEditPage__formContainer">
      <form
        className="TranslationsEditPage__form max-w-162"
        onSubmit={async (e) => {
          e.preventDefault();
          const target = e.currentTarget;
          const keys = ['en', ...nonEnLocales];
          const newTranslations: any = {};
          keys.forEach((key) => {
            const value = (target.elements[key as any] as HTMLInputElement)
              .value;
            newTranslations[key] = normalizeString(value);
          });
          setSaving('translations');
          try {
            await props.onChange(newTranslations);
          } finally {
            setSaving(null);
          }
        }}
      >
        <TextInput
          className="TranslationsEditPage__formInput mt-4"
          name="hash"
          label="hash"
          value={props.hash}
          disabled
        />
        <Textarea
          className="TranslationsEditPage__formInput mt-4"
          name="source"
          label="source"
          value={translations.source}
          autosize
          minRows={1}
          disabled
        />
        <Textarea
          className="TranslationsEditPage__formInput mt-4"
          name="en"
          label="en"
          value={translations.en as string | undefined}
          autosize
          minRows={1}
          disabled={!!saving}
        />
        {nonEnLocales.map((locale) => (
          <Textarea
            key={locale}
            className="TranslationsEditPage__formInput mt-4"
            name={locale}
            label={locale}
            value={getTranslationForLanguage(translations, locale)}
            autosize
            minRows={1}
            disabled={!!saving}
          />
        ))}
        <Button
          className="TranslationsEditPage__formInputSubmit mt-6"
          variant="primary"
          type="submit"
          disabled={!!saving}
          loading={saving === 'translations'}
        >
          {saving === 'translations' ? 'Saving...' : 'Save'}
        </Button>
      </form>

      <div className="TranslationsEditPage__tagsForm mt-12 max-w-162">
        <Heading
          size="h3"
          id="TranslationsEditPage__tagsFormHeading"
          className="TranslationsEditPage__tagsFormHeading mb-4"
        >
          Tags
        </Heading>
        <MultiSelect
          className="TranslationsEditPage__tagsFormInput"
          aria-labelledby="TranslationsEditPage__tagsFormHeading"
          data={tags}
          value={tags}
          onValueChange={setTags}
          placeholder="Add tags"
          creatable
          disabled={!!saving}
          getCreateLabel={(query: string) => `+ Add tag ${query}`}
        />
        <Button
          className="TranslationsEditPage__tagsFormSubmit mt-4"
          variant="primary"
          disabled={!!saving}
          loading={saving === 'tags'}
          onClick={async () => {
            setSaving('tags');
            try {
              await props.onChange({...translations, tags});
            } finally {
              setSaving(null);
            }
          }}
        >
          {saving === 'tags' ? 'Saving...' : 'Save tags'}
        </Button>
      </div>
    </div>
  );
};
