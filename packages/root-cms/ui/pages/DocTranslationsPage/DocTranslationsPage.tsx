import {ActionIcon, Breadcrumbs, Button, Loader, Tooltip} from '@mantine/core';
import {showNotification, updateNotification} from '@mantine/notifications';
import {
  IconFileDownload,
  IconFileUpload,
  IconMoodLookDown,
  IconTable,
} from '@tabler/icons-preact';
import {useEffect, useMemo, useRef, useState} from 'preact/hooks';
import {Heading} from '../../components/Heading/Heading.js';
import {Layout} from '../../layout/Layout.js';
import {joinClassNames} from '../../utils/classes.js';
import {
  CsvTranslation,
  cmsDocImportTranslations,
  cmsGetLinkedGoogleSheetL10n,
  cmsGetTranslations,
} from '../../utils/doc.js';
import {extractStringsForDoc} from '../../utils/extract.js';
import {GoogleSheetId, getSpreadsheetUrl} from '../../utils/gsheets.js';
import {
  Translation,
  TranslationsMap,
  loadTranslations,
} from '../../utils/l10n.js';
import {notifyErrors} from '../../utils/notifications.js';
import './DocTranslationsPage.css';

interface DocTranslationsPageProps {
  collection: string;
  slug: string;
}

export function DocTranslationsPage(props: DocTranslationsPageProps) {
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [sourceStrings, setSourceStrings] = useState<string[]>([]);
  const [translationsMap, setTranslationsMap] = useState<TranslationsMap>({});
  const [linkedSheet, setLinkedSheet] = useState<GoogleSheetId | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [changesMap, setChangesMap] = useState<Record<string, Translation>>({});
  const [saving, setSaving] = useState(false);
  const collection = props.collection;
  const slug = props.slug;
  const docId = `${collection}/${slug}`;

  const i18nConfig = window.__ROOT_CTX.rootConfig.i18n || {};
  const i18nLocales = i18nConfig.locales || ['en'];

  async function init() {
    try {
      const [sourceStrings, translationsMap, linkedSheet] = await Promise.all([
        extractStringsForDoc(docId),
        cmsGetTranslations(docId),
        cmsGetLinkedGoogleSheetL10n(docId),
      ]);
      setSourceStrings(sourceStrings);
      setTranslationsMap(translationsMap);
      setLinkedSheet(linkedSheet);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
      setNotFound(true);
    }
  }

  useEffect(() => {
    init();
  }, []);

  if (notFound) {
    return <DocTranslationsPage.NotFound docId={docId} />;
  }

  function onChange(source: string, locale: string, translation: string) {
    setHasChanges(true);
    setChangesMap((current) => {
      const newValue = {...current};
      const translations = newValue[source] ?? {};
      translations.source = source;
      translations[locale] = translation;
      newValue[source] = translations;
      return newValue;
    });
  }

  async function onSave() {
    setSaving(true);
    await notifyErrors(async () => {
      console.log('EditTranslationsModal.onSave()');
      const notificationId = `edit-translations-${docId}`;
      showNotification({
        id: notificationId,
        loading: true,
        title: 'Saving translations',
        message: `Updating for ${docId}...`,
        autoClose: false,
        disallowClose: true,
      });
      const changes: CsvTranslation[] = Object.values(changesMap);
      console.log(changes);
      await cmsDocImportTranslations(docId, changes);
      updateNotification({
        id: notificationId,
        title: 'Saved translations',
        message: `Updated translations for ${docId}!`,
        autoClose: true,
      });
      setChangesMap({});
      setHasChanges(false);
    });
    setSaving(false);
  }

  return (
    <Layout>
      <div className="DocTranslationsPage">
        <div className="DocTranslationsPage__header">
          <Breadcrumbs className="DocTranslationsPage__header__breadcrumbs">
            <a href={`/cms/content/${collection}`}>{collection}</a>
            <a href={`/cms/content/${collection}/${slug}`}>{slug}</a>
            <div>translations</div>
          </Breadcrumbs>
          <div className="DocTranslationsPage__header__titleWrap">
            <Heading size="h1">Translations: {docId}</Heading>
          </div>
          {linkedSheet && (
            <div className="DocTranslationsPage__header__linkedSheet">
              <div className="DocTranslationsPage__header__linkedSheet__label">
                <strong>NOTE:</strong> Translations for this doc are managed in
                Google Sheets.
              </div>
              <div className="DocTranslationsPage__header__linkedSheet__controls">
                <Tooltip label="Open Google Sheet">
                  <ActionIcon<'a'>
                    component="a"
                    href={getSpreadsheetUrl(linkedSheet)}
                    target="_blank"
                    variant="filled"
                    color="green"
                    size="sm"
                  >
                    <IconTable size={16} strokeWidth={2.25} />
                  </ActionIcon>
                </Tooltip>
                <Button
                  variant="default"
                  size="xs"
                  leftIcon={<IconFileUpload size={16} strokeWidth={1.75} />}
                >
                  Import from Sheet
                </Button>
                <Button
                  variant="default"
                  size="xs"
                  leftIcon={<IconFileDownload size={16} strokeWidth={1.75} />}
                >
                  Export to Sheet
                </Button>
              </div>
            </div>
          )}
        </div>

        <div
          className={joinClassNames(
            'DocTranslationsPage__content',
            loading && 'DocTranslationsPage__content--loading'
          )}
        >
          {loading ? (
            <Loader color="gray" size="xl" />
          ) : (
            <DocTranslationsPage.Table
              locales={i18nLocales}
              sourceStrings={sourceStrings}
              translationsMap={translationsMap}
              onChange={onChange}
              changesMap={changesMap}
            />
          )}
        </div>

        <div className="DocTranslationsPage__footer">
          <div className="DocTranslationsPage__footer__buttons">
            <Button
              variant="filled"
              color="dark"
              disabled={!hasChanges}
              loading={saving}
              onClick={() => onSave()}
            >
              Save
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
}

DocTranslationsPage.NotFound = (props: {docId: string}) => {
  return (
    <Layout>
      <div className="DocTranslationsPage DocTranslationsPage--error">
        <div className="DocTranslationsPage__error">
          <div className="DocTranslationsPage__error__icon">
            <IconMoodLookDown size={60} />
          </div>
          <div className="DocTranslationsPage__error__title">
            Not found: {props.docId}
          </div>
        </div>
      </div>
    </Layout>
  );
};

interface DocTranslationsPageTableProps {
  locales: string[];
  sourceStrings: string[];
  translationsMap: TranslationsMap;
  onChange: (source: string, locale: string, translation: string) => void;
  changesMap: Record<string, Translation>;
}

DocTranslationsPage.Table = (props: DocTranslationsPageTableProps) => {
  const sourceToTranslationsMap = useMemo(() => {
    const results: {[source: string]: Record<string, string>} = {};
    Object.values(props.translationsMap).forEach(
      (row: Record<string, string>) => {
        results[row.source] = row;
      }
    );
    return results;
  }, [props.translationsMap]);

  function getTranslation(source: string, locale: string) {
    const sourceTranslations = sourceToTranslationsMap[source] || {};
    const translation = sourceTranslations[locale] || '';
    return {
      translation: translation,
      hasChanges: false,
    };
  }

  return (
    <div className="DocTranslationsPage__TableWrap">
      <table className="DocTranslationsPage__Table">
        <thead>
          <tr>
            <th>source</th>
            {props.locales.map((locale) => (
              <th key={locale}>{locale}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.sourceStrings.map((source) => (
            <tr key={source}>
              <td className="DocTranslationsPage__Table__sourceCellWrap">
                <div className="DocTranslationsPage__Table__sourceCell">
                  {source}
                </div>
              </td>
              {props.locales.map((locale) => {
                const data = getTranslation(source, locale);
                return (
                  <td key={locale}>
                    <DocTranslationsPage.Textarea
                      source={source}
                      locale={locale}
                      value={data.translation}
                      onChange={props.onChange}
                      changesMap={props.changesMap}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

DocTranslationsPage.Textarea = (props: {
  value: string;
  source: string;
  locale: string;
  onChange: (source: string, locale: string, translation: string) => void;
  changesMap: Record<string, Translation>;
}) => {
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(props.value);
  let changedValue = null;
  if (props.locale in (props.changesMap[props.source] || {})) {
    changedValue = props.changesMap[props.source][props.locale];
  }
  const hasChanges = changedValue !== null && changedValue !== props.value;

  function updateTextareaHeight() {
    window.requestAnimationFrame(() => {
      const textarea = textInputRef.current!;
      textarea.style.minHeight = 'auto';
      // const parent = textarea.parentElement!;
      // const height = Math.max(textarea.scrollHeight, parent.offsetHeight);
      const height = textarea.scrollHeight;
      textarea.style.minHeight = `${height}px`;
    });
  }

  useEffect(() => {
    updateTextareaHeight();
  }, [value]);

  return (
    <textarea
      ref={textInputRef}
      className={joinClassNames(
        'DocTranslationsPage__Textarea',
        hasChanges && 'DocTranslationsPage__Textarea--hasChanges',
        !value && 'DocTranslationsPage__Textarea--empty'
      )}
      onFocus={() => updateTextareaHeight()}
      rows={1}
      onChange={(e) => {
        const newValue = (e.target as HTMLTextAreaElement).value;
        setValue(newValue);
        props.onChange(props.source, props.locale, newValue);
      }}
      value={value}
    ></textarea>
  );
};
