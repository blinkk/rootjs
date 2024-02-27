import {Breadcrumbs, Button, Loader, TextInput, Textarea} from '@mantine/core';
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
    setLoading(true);
    await updateTranslationByHash(hash, newTranslations);
    setTranslations((translations) => {
      return {
        ...translations,
        ...newTranslations,
      };
    });
    setLoading(false);
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
          {/* <Button
            component="a"
            href="/cms/translations"
            leftIcon={<IconArrowLeft size={16} />}
            size="xs"
            variant="subtle"
          >
            Back
          </Button> */}
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

  return (
    <form
      className="TranslationsEditPage__Form"
      onSubmit={(e) => {
        e.preventDefault();
        const target = e.currentTarget;
        const keys = ['en', ...nonEnLocales];
        const newTranslations: any = {};
        keys.forEach((key) => {
          const value = (target.elements[key as any] as HTMLInputElement).value;
          newTranslations[key] = normalizeString(value);
        });
        props.onChange(newTranslations);
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
        disabled
      />
      <Textarea
        className="TranslationsEditPage__Form__input"
        size="xs"
        radius={0}
        name="en"
        label="en"
        value={translations.en}
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
        />
      ))}
      <Button
        className="TranslationsEditPage__Form__input__submit"
        color="blue"
        size="xs"
        type="submit"
      >
        Save
      </Button>
    </form>
  );
};
