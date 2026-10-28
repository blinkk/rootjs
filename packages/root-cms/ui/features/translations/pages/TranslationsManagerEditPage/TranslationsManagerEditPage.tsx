import {
  IconCirclePlus,
  IconRocket,
  IconStatusChange,
} from '@tabler/icons-preact';
import {Timestamp} from 'firebase/firestore';
import {useEffect, useMemo, useRef, useState} from 'preact/hooks';
import {Layout} from '../../../../app/layout/Layout.js';
import {Heading} from '../../../../components/Heading/Heading.js';
import {usePageTitle} from '../../../../hooks/usePageTitle.js';
import {Badge} from '../../../../primitives/Badge/Badge.js';
import {Breadcrumbs} from '../../../../primitives/Breadcrumbs/Breadcrumbs.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {IconButton} from '../../../../primitives/IconButton/IconButton.js';
import {useModals} from '../../../../primitives/modals/ModalsProvider.js';
import {Spinner} from '../../../../primitives/Spinner/Spinner.js';
import {TextInput} from '../../../../primitives/TextInput/TextInput.js';
import {
  showNotification,
  updateNotification,
} from '../../../../primitives/Toast/toastStore.js';
import {cn} from '../../../../utils/classes.js';
import {notifyErrors} from '../../../../utils/notifications.js';
import {usePortTranslationsModal} from '../../components/PortTranslationsModal/PortTranslationsModal.js';
import {extractStringsForDoc} from '../../extract.js';
import {
  getTranslationForLanguage,
  isLocaleExcludedFromTranslations,
  normalizeString,
  toTranslationLanguages,
} from '../../l10n.js';
import {
  TranslationsDocData,
  TranslationsEdit,
  findDraftTranslationsBySource,
  loadTranslationsDoc,
  publishTranslations,
  saveDraftTranslations,
} from '../../translations-manager.js';

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

/** Classes for an id shown inline in confirm dialogs. */
const CODE_CLASSES = 'rounded-sm bg-chip px-1 py-px font-mono text-sm';

/** Borders and sizing shared by every header and body cell. */
const CELL_CLASSES =
  'min-w-48 border border-solid border-border p-0 align-top md:min-w-60';

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
  const portModal = usePortTranslationsModal();

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
      title: `Publish translations: ${translationsId}`,
      children: (
        <div className="TranslationsManagerEditPage__confirmText text-base leading-normal">
          Are you sure you want to publish the translations for{' '}
          <code className={CODE_CLASSES}>{translationsId}</code>? The
          translations will go live immediately.
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

  function openPortModal(row: TranslationsRow) {
    portModal.open({
      id: translationsId,
      targetSource: row.source,
      targetTranslations: row.translations,
      languages: languages,
      loadCandidates: async () =>
        rows.map((r) => ({
          source: r.source,
          translations: r.translations,
          label: r.unused ? 'unused' : undefined,
        })),
      lookupSource: (source) => findDraftTranslationsBySource(source),
      onSave: async (translations) => {
        await saveDraftTranslations(
          translationsId,
          [{source: row.source, translations}],
          {tags: [translationsId]}
        );
        // Discard any unsaved edits for the ported cells, since the ported
        // translations replace them.
        setChangesMap((current) => {
          if (!current[row.source]) {
            return current;
          }
          const remaining = {...current[row.source]};
          Object.keys(translations).forEach((lang) => delete remaining[lang]);
          const next = {...current};
          if (Object.keys(remaining).length > 0) {
            next[row.source] = remaining;
          } else {
            delete next[row.source];
          }
          return next;
        });
        const docData = await loadTranslationsDoc(translationsId);
        setDocData(docData);
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
      <div className="TranslationsManagerEditPage relative flex flex-col bg-page">
        <div className="TranslationsManagerEditPage__header px-(--cms-page-padding-mobile) pb-4 pt-(--cms-page-padding-mobile) md:px-(--cms-page-padding) md:pb-5 md:pt-(--cms-page-padding)">
          <Breadcrumbs
            className="TranslationsManagerEditPage__headerBreadcrumbs mb-3"
            items={[
              {label: 'translations', href: '/cms/translations'},
              {label: translationsId},
            ]}
          />
          <div className="TranslationsManagerEditPage__headerTitleWrap flex flex-wrap items-center gap-x-3 gap-y-2">
            <Heading size="h1" className="min-w-0 break-words">
              Translations: {translationsId}
            </Heading>
            {status === 'published' && (
              <Badge size="xs" variant="gradient" gradient="green">
                Published
              </Badge>
            )}
            {status === 'unpublished-changes' && (
              <Badge size="xs" variant="gradient" gradient="orange">
                Unpublished changes
              </Badge>
            )}
            {status === 'draft' && (
              <Badge size="xs" variant="outline">
                Draft
              </Badge>
            )}
          </div>
          {isDocBacked && (
            <div className="TranslationsManagerEditPage__headerDocLink mt-2 text-sm text-muted">
              Source strings are extracted from{' '}
              <a
                className="font-medium text-muted underline underline-offset-4"
                href={`/cms/content/${translationsId}`}
              >
                {translationsId}
              </a>
              .
            </div>
          )}
        </div>

        <div
          className={cn(
            'TranslationsManagerEditPage__content min-h-0 flex-1 overflow-auto px-(--cms-page-padding-mobile) md:px-(--cms-page-padding)',
            loading &&
              'TranslationsManagerEditPage__content--loading flex items-center justify-center'
          )}
        >
          {loading ? (
            <Spinner size="lg" className="text-muted" />
          ) : rows.length === 0 ? (
            <div className="TranslationsManagerEditPage__empty flex items-center justify-center px-5 py-15 text-base text-muted">
              No source strings yet.
            </div>
          ) : (
            <TranslationsManagerEditPage.Table
              languages={languages}
              rows={rows}
              changesMap={changesMap}
              onChange={onChange}
              onPort={openPortModal}
            />
          )}
        </div>

        <div className="TranslationsManagerEditPage__footer flex flex-wrap items-center justify-between gap-x-5 gap-y-3 border-0 border-t border-solid border-border bg-surface px-(--cms-page-padding-mobile) py-4 md:px-(--cms-page-padding)">
          {!isDocBacked && !loading && (
            <TranslationsManagerEditPage.AddStringInput
              onAdd={onAddSourceString}
            />
          )}
          <div className="TranslationsManagerEditPage__footerButtons ml-auto flex items-center gap-2.5">
            <Button
              variant="primary"
              size="md"
              disabled={!hasChanges}
              loading={saving}
              onClick={() => onSave()}
            >
              Save
            </Button>
            <Button
              size="md"
              icon={<IconRocket size={16} />}
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
  onPort: (row: TranslationsRow) => void;
}) => {
  return (
    <div className="TranslationsManagerEditPage__tableWrap w-fit min-w-full pb-5">
      <table className="TranslationsManagerEditPage__table w-full border-collapse bg-surface font-sans text-fg">
        <thead>
          <tr>
            <th
              className={cn(
                'TranslationsManagerEditPage__tableSourceCellHeader',
                CELL_CLASSES
              )}
            >
              <div className="TranslationsManagerEditPage__tableHeaderLabel px-3 py-2 text-left text-sm font-semibold">
                source
              </div>
            </th>
            {props.languages.map((lang) => (
              <th key={lang} className={CELL_CLASSES}>
                <div className="TranslationsManagerEditPage__tableHeaderLabel px-3 py-2 text-left text-sm font-semibold">
                  {lang}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row) => (
            <tr key={row.source} className="group">
              {/* The 1px cell height lets the textareas fill the row with
                  `height: 100%`; cells still grow to fit their content. */}
              <td
                className={cn(
                  'TranslationsManagerEditPage__tableSourceCellWrap',
                  CELL_CLASSES,
                  'h-px bg-surface-hover'
                )}
              >
                <div className="TranslationsManagerEditPage__tableSourceCell max-w-100 whitespace-pre-wrap break-words px-3 py-2 text-sm leading-normal">
                  {!row.unused && (
                    // The IconButton's tooltip wraps it in a span, so the
                    // float goes on an outer span.
                    <span className="float-right -mr-1.5 -mt-0.5 ml-2 flex">
                      <IconButton
                        className="TranslationsManagerEditPage__tablePortButton opacity-80 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                        variant="default"
                        size="xs"
                        label="Port translations from another string"
                        onClick={() => props.onPort(row)}
                      >
                        <IconStatusChange size={14} />
                      </IconButton>
                    </span>
                  )}
                  {row.source}
                  {row.unused && (
                    <div className="TranslationsManagerEditPage__tableUnusedBadge mt-1.5">
                      <Badge size="xs" variant="outline">
                        unused
                      </Badge>
                    </div>
                  )}
                </div>
              </td>
              {props.languages.map((lang) => (
                <td key={lang} className={cn(CELL_CLASSES, 'h-px')}>
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

  // Sync changes to the saved value (e.g. after translations are ported to
  // this string) unless the cell has unsaved changes.
  useEffect(() => {
    if (changedValue === null) {
      setValue(props.value);
    }
  }, [props.value]);

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
      aria-label={`${props.lang} translation`}
      className={cn(
        'TranslationsManagerEditPage__textarea',
        hasChanges && 'TranslationsManagerEditPage__textarea--hasChanges',
        !value && 'TranslationsManagerEditPage__textarea--empty',
        'm-0 block h-full w-full resize-none border-0 bg-transparent px-3 py-2 font-sans text-sm leading-normal text-fg focus:outline-2 focus:-outline-offset-2 focus:outline-focus',
        hasChanges && 'bg-warning-soft'
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
    <div className="TranslationsManagerEditPage__addString flex w-full items-center gap-2 sm:w-auto">
      <TextInput
        className="TranslationsManagerEditPage__addStringInput min-w-0 flex-1 sm:w-80 sm:flex-none"
        aria-label="Add source string"
        placeholder="Add source string"
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
      <Button icon={<IconCirclePlus size={16} />} onClick={() => submit()}>
        Add
      </Button>
    </div>
  );
};
