import {
  Breadcrumbs,
  Button,
  Loader,
  MultiSelect,
  TextInput,
  Textarea,
} from '@mantine/core';
import {showNotification} from '@mantine/notifications';
import {useEffect, useState} from 'preact/hooks';
import {Heading} from '../../components/Heading/Heading.js';
import {Layout} from '../../layout/Layout.js';
import {
  Translation,
  getTranslationByHash,
  normalizeString,
  updateTranslationByHash,
} from '../../utils/l10n.js';

import './TranslationsEditPage.css';

interface TranslationsEditPageProps {
  hash: string;
}

export function TranslationsEditPage(props: TranslationsEditPageProps) {
  const hash = props.hash;
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [translations, setTranslations] = useState<Translation>({source: ''});

  async function init() {
    setLoading(true);
    const translations = await getTranslationByHash(hash);
    setLoading(false);
    if (!translations?.source) {
      setNotFound(true);
      return;
    }
    setTranslations(translations);
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
      <div className="TranslationsEditPage">
        <div className="TranslationsEditPage__header">
          <Breadcrumbs className="TranslationsEditPage__header__breadcrumbs">
            <a href="/cms/translations">Translations</a>
            <div>{props.hash}</div>
          </Breadcrumbs>
          <Heading size="h1">Edit Translations</Heading>
        </div>
        {loading ? (
          <Loader color="gray" size="xl" />
        ) : notFound ? (
          <div className="TranslationsEditPage__notFound">Not Found</div>
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
  const nonEnLocales = locales.filter((l) => l !== 'en');
  const [tags, setTags] = useState<string[]>(translations.tags || []);
  const [saving, setSaving] = useState<'translations' | 'tags' | null>(null);

  useEffect(() => {
    setTags(translations.tags || []);
  }, [translations.tags]);

  return (
    <div className="TranslationsEditPage__FormContainer">
      <form
        className="TranslationsEditPage__Form"
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
          className="TranslationsEditPage__Form__input"
          size="xs"
          radius={0}
          name="hash"
          label="hash"
          value={props.hash}
          disabled
        />
        <Textarea
          className="TranslationsEditPage__Form__input"
          size="xs"
          radius={0}
          name="source"
          label="source"
          value={translations.source}
          autosize
          disabled
        />
        <Textarea
          className="TranslationsEditPage__Form__input"
          size="xs"
          radius={0}
          name="en"
          label="en"
          value={translations.en}
          autosize
          disabled={!!saving}
        />
        {nonEnLocales.map((locale) => (
          <Textarea
            key={locale}
            className="TranslationsEditPage__Form__input"
            size="xs"
            radius={0}
            name={locale}
            label={locale}
            value={translations[locale] || ''}
            autosize
            disabled={!!saving}
          />
        ))}
        <Button
          className="TranslationsEditPage__Form__input__submit"
          color="blue"
          size="xs"
          type="submit"
          disabled={!!saving}
          loading={saving === 'translations'}
        >
          {saving === 'translations' ? 'Saving...' : 'Save'}
        </Button>
      </form>

      <div className="TranslationsEditPage__TagsForm">
        <Heading size="h3" className="TranslationsEditPage__TagsForm__heading">
          Tags
        </Heading>
        <MultiSelect
          data={tags}
          value={tags}
          onChange={setTags}
          placeholder="Add tags"
          searchable
          creatable
          disabled={!!saving}
          getCreateLabel={(query: string) => `+ Add tag ${query}`}
        />
        <Button
          className="TranslationsEditPage__TagsForm__submit"
          color="blue"
          size="xs"
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
