import './TranslationsManagerEditPage.css';

import {Badge, Breadcrumbs, Button, Loader, TextInput} from '@mantine/core';
import {useModals} from '@mantine/modals';
import {showNotification, updateNotification} from '@mantine/notifications';
import {IconCirclePlus, IconRocket} from '@tabler/icons-preact';
import {Timestamp} from 'firebase/firestore';
import {useEffect, useMemo, useRef, useState} from 'preact/hooks';
import {Heading} from '../../components/Heading/Heading.js';
import {useModalTheme} from '../../hooks/useModalTheme.js';
import {usePageTitle} from '../../hooks/usePageTitle.js';
import {Layout} from '../../layout/Layout.js';
import {joinClassNames} from '../../utils/classes.js';
import {extractStringsForDoc} from '../../utils/extract.js';
import {
  getTranslationForLanguage,
  isLocaleExcludedFromTranslations,
  normalizeString,
  toTranslationLanguages,
} from '../../utils/l10n.js';
import {notifyErrors} from '../../utils/notifications.js';
import {
  TranslationsDocData,
  TranslationsEdit,
  loadTranslationsDoc,
  publishTranslations,
  saveDraftTranslations,
} from '../../utils/translations-manager.js';

interface TranslationsManagerEditPageProps {
  translationsId?: string;
}

interface TranslationsRow {
  source: string;
  /** Translations keyed by root locale (from the stored draft docs). */
  translations: Record<string, string>;
  /**
   * True if the string is stored in the translations doc but no longer used
   * by the backing content doc (doc-backed ids only).
   */
  unused: boolean;
}

/**
 * Returns true if a translations id is backed by a content doc (e.g.
 * `Pages/index`), in which case its source strings are extracted from the
 * doc's fields.
 */
function testIsDocBackedId(id: string): boolean {
  const sepIndex = id.indexOf('/');
  if (sepIndex <= 0) {
    return false;
  }
  const collection = id.slice(0, sepIndex);
  return Boolean(window.__ROOT_CTX.collections[collection]);
}

function toMillis(ts?: Timestamp) {
  return ts?.toMillis ? ts.toMillis() : 0;
}

export function TranslationsManagerEditPage(
  props: TranslationsManagerEditPageProps
) {
  const translationsId = (props.translationsId || '').replace(/\/+$/g, '');
  usePageTitle(`Translations: ${translationsId}`);
  const [loading, setLoading] = useState(true);
  const [docData, setDocData] = useState<TranslationsDocData | null>(null);
  const [docSourceStrings, setDocSourceStrings] = useState<string[]>([]);
  const [addedSourceStrings, setAddedSourceStrings] = useState<string[]>([]);
  const [changesMap, setChangesMap] = useState<
    Record<string, Record<string, string>>
  >({});
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const modals = useModals();
  const modalTheme = useModalTheme();

  const isDocBacked = testIsDocBackedId(translationsId);
  const hasChanges = Object.keys(changesMap).length > 0;

  const i18nConfig = window.__ROOT_CTX.rootConfig.i18n || {};
  // Columns are "translation languages", which may be shared by multiple
  // root locales (per the `i18n.translationLanguages` config).
  const languages = toTranslationLanguages(
    (i18nConfig.locales || []).filter(
      (l) => !isLocaleExcludedFromTranslations(l)
    )
  );

  async function init() {
    await notifyErrors(async () => {
      const [docData, docSourceStrings] = await Promise.all([
        loadTranslationsDoc(translationsId),
        isDocBacked
          ? extractStringsForDoc(translationsId)
          : Promise.resolve([]),
      ]);
      setDocData(docData);
      setDocSourceStrings(docSourceStrings);
    });
    setLoading(false);
  }

  useEffect(() => {
    init();
  }, [translationsId]);

  const rows: TranslationsRow[] = useMemo(() => {
    // Group the stored draft strings by source:
    // {source: {locale: translation}}
    const storedTranslations: Record<string, Record<string, string>> = {};
    Object.values(docData?.draft || {}).forEach((localeDoc) => {
      Object.values(localeDoc.strings || {}).forEach((entry) => {
        if (!entry.source) {
          return;
        }
        storedTranslations[entry.source] ??= {};
        if (entry.translation) {
          storedTranslations[entry.source][localeDoc.locale] =
            entry.translation;
        }
      });
    });

    // Rows are the union of the doc's extracted source strings (doc-backed
    // ids), manually-added strings, and the stored draft strings. Stored
    // strings no longer used by the doc are flagged as "unused".
    const rows: TranslationsRow[] = [];
    const seen = new Set<string>();
    const addRow = (source: string, unused: boolean) => {
      if (!source || seen.has(source)) {
        return;
      }
      seen.add(source);
      rows.push({
        source,
        translations: storedTranslations[source] || {},
        unused,
      });
    };
    docSourceStrings.forEach((source) => addRow(source, false));
    addedSourceStrings.forEach((source) => addRow(source, false));
    Object.keys(storedTranslations).forEach((source) =>
      addRow(source, isDocBacked)
    );
    return rows;
  }, [docData, docSourceStrings, addedSourceStrings, isDocBacked]);

  // Draft-vs-published status.
  const status = useMemo(() => {
    const draftDocs = Object.values(docData?.draft || {});
    if (draftDocs.length === 0) {
      return null;
    }
    const modifiedAt = Math.max(
      ...draftDocs.map((d) => toMillis(d.sys?.modifiedAt))
    );
    const publishedAt = Math.max(
      ...draftDocs.map((d) => toMillis(d.sys?.publishedAt))
    );
    if (!publishedAt) {
      return 'draft';
    }
    if (modifiedAt > publishedAt) {
      return 'unpublished-changes';
    }
    return 'published';
  }, [docData]);

  function onChange(source: string, lang: string, translation: string) {
    setChangesMap((current) => {
      const newValue = {...current};
      newValue[source] = {...(newValue[source] || {}), [lang]: translation};
      return newValue;
    });
  }

  async function onSave() {
    setSaving(true);
    await notifyErrors(async () => {
      const notificationId = `save-translations-${translationsId}`;
      showNotification({
        id: notificationId,
        loading: true,
        title: 'Saving translations',
        message: `Updating ${translationsId}...`,
        autoClose: false,
        disallowClose: true,
      });
      const edits: TranslationsEdit[] = Object.entries(changesMap).map(
        ([source, translations]) => ({source, translations})
      );
      await saveDraftTranslations(translationsId, edits, {
        tags: [translationsId],
      });
      updateNotification({
        id: notificationId,
        title: 'Saved translations',
        message: `Saved draft translations for ${translationsId}!`,
        autoClose: true,
      });
      setChangesMap({});
      await init();
    });
    setSaving(false);
  }

  function onPublish() {
    modals.openConfirmModal({
      ...modalTheme,
      title: `Publish translations: ${translationsId}`,
      children: (
        <div className="TranslationsManagerEditPage__confirmText">
          Are you sure you want to publish the translations for{' '}
          <code>{translationsId}</code>? The translations will go live
          immediately.
        </div>
      ),
      labels: {confirm: 'Publish', cancel: 'Cancel'},
      cancelProps: {size: 'xs'},
      confirmProps: {color: 'dark', size: 'xs'},
      onConfirm: async () => {
        setPublishing(true);
        await notifyErrors(async () => {
          await publishTranslations(translationsId);
          showNotification({
            title: 'Published translations',
            message: `Published translations for ${translationsId}.`,
            autoClose: 10000,
          });
          await init();
        });
        setPublishing(false);
      },
    });
  }

  function onAddSourceString(source: string) {
    const normalized = normalizeString(source);
    if (!normalized) {
      return;
    }
    setAddedSourceStrings((current) =>
      current.includes(normalized) ? current : [...current, normalized]
    );
  }

  return (
    <Layout>
      <div className="TranslationsManagerEditPage">
        <div className="TranslationsManagerEditPage__header">
          <Breadcrumbs className="TranslationsManagerEditPage__header__breadcrumbs">
            <a href="/cms/translations">translations</a>
            <div>{translationsId}</div>
          </Breadcrumbs>
          <div className="TranslationsManagerEditPage__header__titleWrap">
            <Heading size="h1">Translations: {translationsId}</Heading>
            {status === 'published' && (
              <Badge
                size="xs"
                variant="gradient"
                gradient={{from: 'teal', to: 'lime'}}
              >
                Published
              </Badge>
            )}
            {status === 'unpublished-changes' && (
              <Badge
                size="xs"
                variant="gradient"
                gradient={{from: 'orange', to: 'yellow'}}
              >
                Unpublished changes
              </Badge>
            )}
            {status === 'draft' && (
              <Badge size="xs" variant="outline" color="gray">
                Draft
              </Badge>
            )}
          </div>
          {isDocBacked && (
            <div className="TranslationsManagerEditPage__header__docLink">
              Source strings are extracted from{' '}
              <a href={`/cms/content/${translationsId}`}>{translationsId}</a>.
            </div>
          )}
        </div>

        <div
          className={joinClassNames(
            'TranslationsManagerEditPage__content',
            loading && 'TranslationsManagerEditPage__content--loading'
          )}
        >
          {loading ? (
            <Loader color="gray" size="xl" />
          ) : rows.length === 0 ? (
            <div className="TranslationsManagerEditPage__empty">
              No source strings yet.
            </div>
          ) : (
            <TranslationsManagerEditPage.Table
              languages={languages}
              rows={rows}
              changesMap={changesMap}
              onChange={onChange}
            />
          )}
        </div>

        <div className="TranslationsManagerEditPage__footer">
          {!isDocBacked && !loading && (
            <TranslationsManagerEditPage.AddStringInput
              onAdd={onAddSourceString}
            />
          )}
          <div className="TranslationsManagerEditPage__footer__buttons">
            <Button
              variant="filled"
              color="dark"
              disabled={!hasChanges}
              loading={saving}
              onClick={() => onSave()}
            >
              Save
            </Button>
            <Button
              variant="default"
              color="dark"
              leftIcon={<IconRocket size={16} />}
              disabled={loading || !docData || hasChanges || !status}
              loading={publishing}
              onClick={() => onPublish()}
            >
              Publish
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
}

TranslationsManagerEditPage.Table = (props: {
  languages: string[];
  rows: TranslationsRow[];
  changesMap: Record<string, Record<string, string>>;
  onChange: (source: string, lang: string, translation: string) => void;
}) => {
  return (
    <div className="TranslationsManagerEditPage__TableWrap">
      <table className="TranslationsManagerEditPage__Table">
        <thead>
          <tr>
            <th className="TranslationsManagerEditPage__Table__sourceCellHeader">
              <div className="TranslationsManagerEditPage__Table__headerLabel">
                source
              </div>
            </th>
            {props.languages.map((lang) => (
              <th key={lang}>
                <div className="TranslationsManagerEditPage__Table__headerLabel">
                  {lang}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row) => (
            <tr key={row.source}>
              <td className="TranslationsManagerEditPage__Table__sourceCellWrap">
                <div className="TranslationsManagerEditPage__Table__sourceCell">
                  {row.source}
                  {row.unused && (
                    <div className="TranslationsManagerEditPage__Table__unusedBadge">
                      <Badge size="xs" variant="outline" color="gray">
                        unused
                      </Badge>
                    </div>
                  )}
                </div>
              </td>
              {props.languages.map((lang) => (
                <td key={lang}>
                  <TranslationsManagerEditPage.Textarea
                    source={row.source}
                    lang={lang}
                    value={getTranslationForLanguage(row.translations, lang)}
                    changesMap={props.changesMap}
                    onChange={props.onChange}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

TranslationsManagerEditPage.Textarea = (props: {
  source: string;
  lang: string;
  value: string;
  changesMap: Record<string, Record<string, string>>;
  onChange: (source: string, lang: string, translation: string) => void;
}) => {
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(props.value);
  let changedValue: string | null = null;
  if (props.lang in (props.changesMap[props.source] || {})) {
    changedValue = props.changesMap[props.source][props.lang];
  }
  const hasChanges = changedValue !== null && changedValue !== props.value;

  function updateTextareaHeight() {
    window.requestAnimationFrame(() => {
      const textarea = textInputRef.current;
      if (!textarea) {
        return;
      }
      textarea.style.minHeight = 'auto';
      textarea.style.minHeight = `${textarea.scrollHeight}px`;
    });
  }

  useEffect(() => {
    updateTextareaHeight();
  }, [value]);

  return (
    <textarea
      ref={textInputRef}
      className={joinClassNames(
        'TranslationsManagerEditPage__Textarea',
        hasChanges && 'TranslationsManagerEditPage__Textarea--hasChanges',
        !value && 'TranslationsManagerEditPage__Textarea--empty'
      )}
      onFocus={() => updateTextareaHeight()}
      rows={1}
      onChange={(e) => {
        const newValue = (e.target as HTMLTextAreaElement).value;
        setValue(newValue);
        props.onChange(props.source, props.lang, newValue);
      }}
      value={value}
    ></textarea>
  );
};

TranslationsManagerEditPage.AddStringInput = (props: {
  onAdd: (source: string) => void;
}) => {
  const [value, setValue] = useState('');

  function submit() {
    if (!value.trim()) {
      return;
    }
    props.onAdd(value);
    setValue('');
  }

  return (
    <div className="TranslationsManagerEditPage__addString">
      <TextInput
        className="TranslationsManagerEditPage__addString__input"
        placeholder="Add source string"
        size="xs"
        value={value}
        onChange={(e: Event) => {
          setValue((e.target as HTMLInputElement).value);
        }}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
      />
      <Button
        variant="default"
        color="dark"
        size="xs"
        leftIcon={<IconCirclePlus size={16} />}
        onClick={() => submit()}
      >
        Add
      </Button>
    </div>
  );
};
