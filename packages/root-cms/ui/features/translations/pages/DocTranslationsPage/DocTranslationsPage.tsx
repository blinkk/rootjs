import {
  IconFileDownload,
  IconFileUpload,
  IconMoodLookDown,
  IconScissors,
  IconTable,
  IconTool,
} from '@tabler/icons-preact';
import {useEffect, useMemo, useRef, useState} from 'preact/hooks';
import {Layout} from '../../../../app/layout/Layout.js';
import {Heading} from '../../../../components/Heading/Heading.js';
import {usePageTitle} from '../../../../hooks/usePageTitle.js';
import {useArrayParam} from '../../../../hooks/useQueryParam.js';
import {
  GoogleSheetId,
  getSpreadsheetUrl,
} from '../../../../integrations/gsheets.js';
import {Breadcrumbs} from '../../../../primitives/Breadcrumbs/Breadcrumbs.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {IconButton} from '../../../../primitives/IconButton/IconButton.js';
import {Menu, MenuItem} from '../../../../primitives/Menu/Menu.js';
import {Spinner} from '../../../../primitives/Spinner/Spinner.js';
import {
  showNotification,
  updateNotification,
} from '../../../../primitives/Toast/toastStore.js';
import {Tooltip} from '../../../../primitives/Tooltip/Tooltip.js';
import {cn} from '../../../../utils/classes.js';
import {notifyErrors} from '../../../../utils/notifications.js';
import {withTimeout} from '../../../../utils/with-timeout.js';
import {
  CsvTranslation,
  cmsDocImportTranslations,
  cmsGetLinkedGoogleSheetL10n,
} from '../../../documents/doc.js';
import {usePruneTranslationsModal} from '../../components/PruneTranslationsModal/PruneTranslationsModal.js';
import {extractStringsForDoc} from '../../extract.js';
import {
  Translation,
  TranslationsMap,
  getTranslationForLanguage,
  isLocaleExcludedFromTranslations,
  loadTranslationsByHashes,
  sourceHash,
  toTranslationLanguages,
} from '../../l10n.js';

/**
 * Returns true if a cell's edited value differs from its saved value.
 */
function testCellHasChanges(
  changesMap: Record<string, Translation>,
  source: string,
  locale: string,
  savedValue: string
) {
  const changes = changesMap[source] || {};
  return locale in changes && changes[locale] !== savedValue;
}

interface DocTranslationsPageProps {
  collection: string;
  slug: string;
}

export function DocTranslationsPage(props: DocTranslationsPageProps) {
  usePageTitle(`Translations: ${props.collection}/${props.slug}`);
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
  const pruneModal = usePruneTranslationsModal();

  const i18nConfig = window.__ROOT_CTX.rootConfig.i18n || {};
  // Columns are "translation languages", which may be shared by multiple
  // root locales (per the `i18n.translationLanguages` config).
  const defaultLocales = toTranslationLanguages(
    (i18nConfig.locales || []).filter(
      (l) => !isLocaleExcludedFromTranslations(l)
    )
  );
  const [i18nLocales, setI18nLocales] = useArrayParam('locale', defaultLocales);

  async function init() {
    try {
      const [sourceStrings, linkedSheet] = await withTimeout(
        Promise.all([
          extractStringsForDoc(docId),
          cmsGetLinkedGoogleSheetL10n(docId),
        ]),
        undefined,
        'loading doc strings'
      );
      // Hash each source string and load only the matching translations,
      // instead of downloading the project's entire translations collection.
      const hashes = await Promise.all(
        sourceStrings.map((source) => sourceHash(source))
      );
      const translationsMap = await withTimeout(
        loadTranslationsByHashes(hashes),
        undefined,
        'loading translations'
      );
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

  /** Toggles the locale in the URL and updates the state accordingly. */
  function toggleLocale(locale: string) {
    if (i18nLocales.length === defaultLocales.length) {
      // Show only the selected locale.
      setI18nLocales([locale]);
    } else {
      // Show all locales.
      setI18nLocales(defaultLocales);
    }
  }

  return (
    <Layout>
      <div className="DocTranslationsPage relative flex flex-col">
        <div className="DocTranslationsPage__header px-4 pb-4 pt-6 md:px-15 md:pb-8 md:pt-12">
          <Breadcrumbs
            className="DocTranslationsPage__headerBreadcrumbs mb-3"
            items={[
              {label: collection, href: `/cms/content/${collection}`},
              {label: slug, href: `/cms/content/${collection}/${slug}`},
              {label: 'translations'},
            ]}
          />
          <div className="DocTranslationsPage__headerTitleWrap flex min-w-0 items-center gap-3">
            <Heading size="h1" className="min-w-0 break-words">
              Translations: {docId}
            </Heading>
          </div>
          <div className="DocTranslationsPage__headerControls mt-2.5 flex flex-wrap items-center justify-end gap-2.5">
            {linkedSheet && (
              <div className="DocTranslationsPage__headerLinkedSheet flex items-center justify-between">
                <div className="DocTranslationsPage__headerLinkedSheetControls flex flex-wrap items-center gap-2">
                  <IconButton
                    label="Open Google Sheet"
                    href={getSpreadsheetUrl(linkedSheet)}
                    target="_blank"
                    variant="green"
                  >
                    <IconTable size={16} strokeWidth={2.25} />
                  </IconButton>
                  <Button
                    icon={<IconFileUpload size={16} strokeWidth={1.75} />}
                  >
                    Import from Sheet
                  </Button>
                  <Button
                    icon={<IconFileDownload size={16} strokeWidth={1.75} />}
                  >
                    Export to Sheet
                  </Button>
                </div>
              </div>
            )}
            <Menu
              className="DocTranslationsPage__toolsMenu"
              placement="bottom-end"
              width={220}
              trigger={
                <IconButton label="Tools" variant="default">
                  <IconTool size={16} />
                </IconButton>
              }
            >
              <MenuItem
                className="DocTranslationsPage__toolsMenuItem"
                icon={<IconScissors size={16} />}
                onClick={() =>
                  pruneModal.open({
                    docId,
                    sourceStrings,
                    onPruned: (prunedHashes) => {
                      setTranslationsMap((prev) => {
                        const next = {...prev};
                        prunedHashes.forEach((hash) => delete next[hash]);
                        return next;
                      });
                    },
                  })
                }
              >
                Prune unused strings
              </MenuItem>
            </Menu>
          </div>
        </div>

        <div
          className={cn(
            'DocTranslationsPage__content min-h-0 flex-1 overflow-auto',
            loading && 'DocTranslationsPage__content--loading px-4 md:px-15'
          )}
        >
          {loading ? (
            <Spinner size="lg" className="text-muted" />
          ) : (
            <DocTranslationsPage.Table
              locales={i18nLocales}
              sourceStrings={sourceStrings}
              translationsMap={translationsMap}
              onChange={onChange}
              changesMap={changesMap}
              onSelectLocale={(locale) => toggleLocale(locale)}
            />
          )}
        </div>

        <div className="DocTranslationsPage__footer flex h-15 shrink-0 items-center justify-end border-0 border-t border-solid border-border bg-surface px-4 md:px-8">
          <div className="DocTranslationsPage__footerButtons flex items-center gap-2.5">
            <Button
              variant="primary"
              size="md"
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
        <div className="DocTranslationsPage__error flex size-full flex-col items-center justify-center gap-3 p-4 text-center">
          <div className="DocTranslationsPage__errorIcon text-muted">
            <IconMoodLookDown size={60} />
          </div>
          <div className="DocTranslationsPage__errorTitle break-words text-lg font-semibold">
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
  onSelectLocale: (locale: string) => void;
  changesMap: Record<string, Translation>;
}

/** Fixed column width: narrower on phones so a column fits on screen. */
const CELL_WIDTH_CLASSES =
  'w-64 min-w-64 max-w-64 md:w-112 md:min-w-112 md:max-w-112';

/** Borders shared by every header and body cell. */
const CELL_BORDER_CLASSES = 'border border-solid border-border';

DocTranslationsPage.Table = (props: DocTranslationsPageTableProps) => {
  const i18nConfig = window.__ROOT_CTX.rootConfig.i18n || {};
  const allLocales = toTranslationLanguages(
    (i18nConfig.locales || []).filter(
      (l) => !isLocaleExcludedFromTranslations(l)
    )
  );
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
    const translation = getTranslationForLanguage(sourceTranslations, locale);
    return {
      translation: translation,
      hasChanges: false,
    };
  }

  return (
    <div className="DocTranslationsPage__tableWrap">
      <table className="DocTranslationsPage__table table-fixed border-collapse border-spacing-0 font-sans text-sm text-fg">
        <thead className="sticky top-0 z-(--cms-z-sticky)">
          <tr>
            <th
              className={cn(
                'DocTranslationsPage__tableSourceCellHeader',
                CELL_BORDER_CLASSES,
                'bg-surface-hover p-0 text-left font-bold md:sticky md:left-0 md:z-(--cms-z-sticky)'
              )}
            >
              <div className="DocTranslationsPage__tableHeaderLabel block w-full px-2.5 py-1">
                source
              </div>
            </th>
            {props.locales.map((locale) => (
              <th
                key={locale}
                className={cn(
                  'DocTranslationsPage__tableLocaleHeader',
                  CELL_BORDER_CLASSES,
                  'relative bg-surface-hover p-0 text-left'
                )}
              >
                <Tooltip
                  className="DocTranslationsPage__tableHeaderTooltip w-full"
                  placement="top-start"
                  label={
                    props.locales.length === allLocales.length
                      ? `Show only ${locale}`
                      : 'Show all locales'
                  }
                >
                  <button
                    type="button"
                    className="DocTranslationsPage__tableHeaderLabel m-0 block w-full cursor-pointer appearance-none border-0 bg-transparent px-2.5 py-1 text-left font-sans text-sm font-bold text-fg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
                    onClick={() => props.onSelectLocale(locale)}
                  >
                    {locale}
                  </button>
                </Tooltip>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.sourceStrings.map((source) => (
            // The 1px row height lets cell contents fill the row with
            // `height: 100%`.
            <tr key={source} className="h-px">
              <td
                className={cn(
                  'DocTranslationsPage__tableSourceCellWrap',
                  CELL_BORDER_CLASSES,
                  CELL_WIDTH_CLASSES,
                  'm-0 h-px break-words bg-surface-hover p-0 md:sticky md:left-0'
                )}
              >
                <div className="DocTranslationsPage__tableSourceCell h-full whitespace-pre-wrap break-words px-2.5 py-1.5">
                  {source}
                </div>
              </td>
              {props.locales.map((locale) => {
                const data = getTranslation(source, locale);
                const hasChanges = testCellHasChanges(
                  props.changesMap,
                  source,
                  locale,
                  data.translation
                );
                return (
                  <td
                    key={locale}
                    className={cn(
                      CELL_BORDER_CLASSES,
                      CELL_WIDTH_CLASSES,
                      'm-0 h-px break-words p-0',
                      hasChanges && 'bg-warning-soft'
                    )}
                  >
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
  const hasChanges = testCellHasChanges(
    props.changesMap,
    props.source,
    props.locale,
    props.value
  );

  function updateTextareaHeight() {
    window.requestAnimationFrame(() => {
      const textarea = textInputRef.current!;
      textarea.style.minHeight = 'auto';
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
      aria-label={`${props.locale} translation`}
      className={cn(
        'DocTranslationsPage__textarea',
        hasChanges && 'DocTranslationsPage__textarea--hasChanges',
        !value && 'DocTranslationsPage__textarea--empty',
        'm-0 block h-full min-h-full w-full resize-none rounded-none border border-solid border-transparent bg-transparent px-2.5 py-1.5 font-sans text-sm text-fg focus:border-focus focus:outline-none',
        !value && 'bg-danger-soft'
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
