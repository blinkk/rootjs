import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconArrowUpRight,
  IconArrowsTransferDown,
  IconCheck,
  IconChevronDown,
  IconExternalLink,
  IconFileDownload,
  IconFileUpload,
  IconFilter,
  IconLanguage,
  IconMapPin,
  IconPlayerStop,
  IconRobot,
  IconScissors,
  IconTable,
  IconTool,
} from '@tabler/icons-preact';
import {useEffect, useMemo, useRef, useState} from 'preact/hooks';
import {useLocation} from 'preact-iso';
import * as schema from '../../../../../core/schema.js';
import {
  MAX_CSV_IMPORT_BYTES,
  MAX_CSV_IMPORT_LABEL,
} from '../../../../../shared/csv.js';
import {Heading} from '../../../../components/Heading/Heading.js';
import {
  GSheet,
  GSpreadsheet,
  GoogleSheetId,
  getSpreadsheetUrl,
} from '../../../../integrations/gsheets.js';
import {
  GapiClient,
  useGapiClient,
} from '../../../../integrations/useGapiClient.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {Checkbox} from '../../../../primitives/Checkbox/Checkbox.js';
import {DialogFooter} from '../../../../primitives/Dialog/Dialog.js';
import {IconButton} from '../../../../primitives/IconButton/IconButton.js';
import {
  Menu,
  MenuDivider,
  MenuGroup,
  MenuItem,
} from '../../../../primitives/Menu/Menu.js';
import {
  type ContextModalProps,
  useModals,
} from '../../../../primitives/modals/ModalsProvider.js';
import {Select} from '../../../../primitives/Select/Select.js';
import {Spinner} from '../../../../primitives/Spinner/Spinner.js';
import {Textarea} from '../../../../primitives/Textarea/Textarea.js';
import {
  hideNotification,
  showNotification,
  updateNotification,
} from '../../../../primitives/Toast/toastStore.js';
import {Tooltip} from '../../../../primitives/Tooltip/Tooltip.js';
import {cn} from '../../../../utils/classes.js';
import {testAiEnabled} from '../../../ai/ai.js';
import {
  CsvTranslation,
  cmsDocImportTranslations,
  cmsGetLinkedGoogleSheetL10n,
  cmsUnlinkGoogleSheetL10n,
} from '../../../documents/doc.js';
import {DraftDocController} from '../../../documents/useDraftDoc.js';
import {logAction} from '../../../logs/actions.js';
import {
  extractStringsForDoc,
  extractStringsWithMetadataForDoc,
} from '../../extract.js';
import {
  Translation,
  TranslationsMap,
  batchSaveTranslations,
  batchUpdateTags,
  getLocalesForTranslationLanguage,
  getTranslationByHash,
  getTranslationForLanguage,
  getTranslationLanguage,
  isLocaleExcludedFromTranslations,
  loadTranslations,
  loadTranslationsByHashes,
  sourceHash,
  toLocaleTranslations,
  toTranslationLanguages,
} from '../../l10n.js';
import {testV2TranslationsEnabled} from '../../translations-manager.js';
import {useExportSheetModal} from '../ExportSheetModal/ExportSheetModal.js';
import {usePortTranslationsModal} from '../PortTranslationsModal/PortTranslationsModal.js';
import {ProgressiveLoader} from '../ProgressiveLoader/ProgressiveLoader.js';
import {usePruneTranslationsModal} from '../PruneTranslationsModal/PruneTranslationsModal.js';
import './LocalizationModal.css';

const MODAL_ID = 'LocalizationModal';

enum MenuAction {
  EXPORT_DOWNLOAD_CSV = 'EXPORT_DOWNLOAD_CSV',
  EXPORT_GOOGLE_SHEET_CREATE = 'EXPORT_GOOGLE_SHEET_CREATE',
  EXPORT_GOOGLE_SHEET_ADD_TAB = 'EXPORT_GOOGLE_SHEET_ADD_TAB',
  EXPORT_GOOGLE_SHEET_LINKED = 'EXPORT_GOOGLE_SHEET_LINKED',
  EXPORT_GOOGLE_SHEET_SHOW_OPTIONS = 'EXPORT_GOOGLE_SHEET_SHOW_OPTIONS',
  IMPORT_CSV = 'IMPORT_CSV',
  IMPORT_GOOGLE_SHEET_LINKED = 'IMPORT_GOOGLE_SHEET_LINKED',
  UNLINK_GOOGLE_SHEET = 'UNLINK_GOOGLE_SHEET',
}

export interface LocalizationModalProps {
  [key: string]: unknown;
  draft: DraftDocController;
  collection: schema.Collection;
  docId: string;
  locale?: string;
}

export function useLocalizationModal() {
  const modals = useModals();
  return {
    open: (innerProps: LocalizationModalProps) => {
      // Add modal param to URL.
      const params = new URLSearchParams(window.location.search);
      params.set('modal', 'localization');
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}?${params}`
      );

      modals.openContextModal(MODAL_ID, {
        innerProps: innerProps,
        size: 'clamp(80%, 1024px, 1280px)',
        // The panes run to the bottom of the body, and from `md` up each
        // scrolls on its own.
        bodyClassName: 'pb-0',
        onClose: () => {
          // Flush any pending draft changes (e.g. locale toggles) without
          // triggering the iframe reload that normally follows a flush.
          innerProps.draft?.flush({quiet: true});
          // Remove modal param from URL.
          const params = new URLSearchParams(window.location.search);
          params.delete('modal');
          const newUrl = params.toString()
            ? `${window.location.pathname}?${params}`
            : window.location.pathname;
          window.history.replaceState(null, '', newUrl);
        },
      });
    },
  };
}

export function LocalizationModal(
  modalProps: ContextModalProps<LocalizationModalProps>
) {
  const props = modalProps.innerProps;
  const v2 = testV2TranslationsEnabled();
  return (
    <div
      className={cn(
        'LocalizationModal',
        // The translations editor's save bar is in the dialog's footer.
        !v2 && 'LocalizationModal--withFooter'
      )}
    >
      <div className="LocalizationModal__layout flex flex-col gap-6 md:flex-row md:gap-0">
        <LocalizationModal.ConfigLocales {...props} />
        {v2 ? (
          <LocalizationModal.TranslationsManagerLink
            docId={props.docId}
            onNavigate={() => modalProps.context.closeModal(modalProps.id)}
          />
        ) : (
          <LocalizationModal.Translations {...props} />
        )}
      </div>
    </div>
  );
}

LocalizationModal.id = MODAL_ID;

LocalizationModal.ConfigLocales = (props: LocalizationModalProps) => {
  const [enabledLocales, setEnabledLocales] = useState(() => {
    if (props.draft) {
      return props.draft.getLocales();
    }
    return ['en'];
  });
  const i18nConfig = window.__ROOT_CTX.rootConfig.i18n || {};
  const i18nLocales = i18nConfig.locales || ['en'];
  const localeGroups: LocaleGroupsConfig = i18nConfig.groups || {
    default: {
      label: '',
      locales: i18nLocales,
    },
  };

  function enabledLocalesFor(groupId: string) {
    return enabledLocales.filter((l: string) => {
      const groupLocales = localeGroups[groupId].locales || [];
      return groupLocales.includes(l);
    });
  }

  function setGroupEnabledLocales(groupId: string, locales: string[]) {
    const localeSet = new Set(enabledLocales);
    const groupLocales = localeGroups[groupId].locales || [];
    for (const locale of groupLocales) {
      if (locales.includes(locale)) {
        localeSet.add(locale);
      } else {
        localeSet.delete(locale);
      }
    }
    const newLocales = Array.from(localeSet.values()).sort();
    updateEnabledLocales(newLocales);
  }

  function updateEnabledLocales(newLocales: string[]) {
    setEnabledLocales(newLocales);
    props.draft.setLocales(newLocales);
  }

  return (
    <div className="LocalizationModal__locales pt-8 md:min-h-100 md:w-50 md:shrink-0 md:overflow-auto md:pb-8 md:pr-8 lg:w-auto lg:max-w-100">
      <div className="flex flex-col gap-8">
        <div className="flex flex-wrap items-center gap-4">
          <Heading
            className="LocalizationModal__iconTitle LocalizationModal__localesTitle flex items-center gap-2 whitespace-nowrap"
            size="h2"
          >
            <IconMapPin strokeWidth={1.5} />
            <span>Locales</span>
          </Heading>
          <LocalizationModal.AllNoneButtons
            onAllClicked={() => updateEnabledLocales(i18nLocales)}
            onNoneClicked={() => updateEnabledLocales([])}
          />
        </div>
        <div className="flex flex-col gap-10">
          {Object.keys(localeGroups).map((groupId: string) => {
            const group = localeGroups[groupId];
            const groupEnabledLocales = enabledLocalesFor(groupId);
            return (
              <LocalizationModal.LocaleGroup
                group={group}
                groupEnabledLocales={groupEnabledLocales}
                allEnabledLocales={enabledLocales}
                onChange={(locales) => setGroupEnabledLocales(groupId, locales)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

interface LocaleGroup {
  label?: string;
  locales: string[];
}

type LocaleGroupsConfig = Record<string, LocaleGroup>;

interface LocaleGroupProps {
  group: LocaleGroup;
  groupEnabledLocales: string[];
  allEnabledLocales: string[];
  onChange?: (locales: string[]) => void;
}

LocalizationModal.LocaleGroup = (props: LocaleGroupProps) => {
  const enabledLocales = props.groupEnabledLocales || [];
  const groupLocales = props.group.locales || [];
  const allEnabledLocales = props.allEnabledLocales || [];

  function setEnabledLocales(locales: string[]) {
    if (props.onChange) {
      props.onChange(locales);
    }
  }

  function toggleLocale(locale: string) {
    const index = enabledLocales.indexOf(locale);
    if (index === -1) {
      enabledLocales.push(locale);
    } else {
      enabledLocales.splice(index, 1);
    }
    setEnabledLocales(enabledLocales);
  }

  return (
    <div className="LocalizationModal__localeGroup flex flex-col gap-4">
      {props.group.label && (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Heading size="h4" weight="semi-bold">
            {props.group.label}
          </Heading>
          <LocalizationModal.AllNoneButtons
            onAllClicked={() => setEnabledLocales(groupLocales)}
            onNoneClicked={() => setEnabledLocales([])}
          />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-4">
        {groupLocales.map((locale) => {
          const checked = enabledLocales.includes(locale);
          const disabled = allEnabledLocales.length <= 1 && checked;
          return (
            <Checkbox
              value={locale}
              checked={checked}
              disabled={disabled}
              label={getLocaleLabel(locale)}
              onChange={() => toggleLocale(locale)}
            />
          );
        })}
      </div>
    </div>
  );
};

interface AllNoneButtonsProps {
  onAllClicked?: () => void;
  onNoneClicked?: () => void;
}

LocalizationModal.AllNoneButtons = (props: AllNoneButtonsProps) => {
  return (
    <div className="LocalizationModal__allNone flex items-center gap-2">
      <Button
        className="LocalizationModal__allNoneBtn text-link"
        variant="subtle"
        size="xs"
        onClick={props.onAllClicked}
      >
        All
      </Button>
      /
      <Button
        className="LocalizationModal__allNoneBtn text-link"
        variant="subtle"
        size="xs"
        onClick={props.onNoneClicked}
      >
        None
      </Button>
    </div>
  );
};

interface TranslationsManagerLinkProps {
  docId: string;
  onNavigate: () => void;
}

/**
 * Links to the v2 translations manager, which replaces the modal's
 * translations editor when `experiments.v2TranslationsManager` is enabled.
 */
LocalizationModal.TranslationsManagerLink = (
  props: TranslationsManagerLinkProps
) => {
  const {route} = useLocation();
  return (
    <div className={TRANSLATIONS_PANEL_CLASSES}>
      <div className="flex flex-col gap-4 pt-8">
        <Heading
          className="LocalizationModal__translationsTitle LocalizationModal__iconTitle flex items-center gap-2 whitespace-nowrap"
          size="h2"
        >
          <IconLanguage strokeWidth={1.5} /> <span>Translations</span>
        </Heading>
        <p className="m-0 text-base text-muted">
          Translations for this doc are managed in the translations manager.
        </p>
        <div>
          <Button
            icon={<IconArrowUpRight />}
            onClick={() => {
              props.onNavigate();
              route(`/cms/translations/${props.docId}`);
            }}
          >
            Edit translations
          </Button>
        </div>
      </div>
    </div>
  );
};

/**
 * The translations panel: stacked under the locales on mobile, and a
 * scrolling column beside them (with a divider) from `md` up.
 */
const TRANSLATIONS_PANEL_CLASSES =
  'LocalizationModal__translations flex min-w-0 flex-1 flex-col border-0 pb-5 border-t border-solid border-border md:min-h-100 md:-mr-5 md:overflow-auto md:border-l md:border-t-0 md:pl-8 md:pr-5';

interface TranslationsProps {
  collection: schema.Collection;
  docId: string;
  locale?: string;
}

LocalizationModal.Translations = (props: TranslationsProps) => {
  const [loading, setLoading] = useState(true);
  const [sourceStrings, setSourceStrings] = useState<string[]>([]);
  const locales = window.__ROOT_CTX.rootConfig.i18n?.locales || [];
  // The translations UI operates on "translation languages", which may be
  // shared by multiple root locales (e.g. `es-419` covering `es_mx` and
  // `es_co`, per the `i18n.translationLanguages` config).
  const translationLanguages = toTranslationLanguages(locales);
  const defaultLocale =
    (props.locale && getTranslationLanguage(props.locale)) ||
    translationLanguages.find((l) => l !== 'en') ||
    'en';
  const [selectedLocale, setSelectedLocale] = useState(defaultLocale);
  const [filterMissing, setFilterMissing] = useState(false);
  const [translationsMap, setTranslationsMap] = useState<TranslationsMap>({});
  const localeTranslations = useMemo(() => {
    if (!selectedLocale) return {};
    const result: Record<string, string> = {};
    Object.values(translationsMap).forEach(
      (translation: Record<string, string>) => {
        result[translation.source] = getTranslationForLanguage(
          translation,
          selectedLocale
        );
      }
    );
    return result;
  }, [selectedLocale, translationsMap]);
  const gapiClient = useGapiClient();
  const [linkedSheet, setLinkedSheet] = useState<GoogleSheetId | null>(null);
  const exportSheetModal = useExportSheetModal();
  const pruneModal = usePruneTranslationsModal();
  const portModal = usePortTranslationsModal();
  const [missingTagSources, setMissingTagSources] = useState<Set<string>>(
    new Set()
  );
  const missingTagsCount = missingTagSources.size;
  // Track pending edits: Map<sourceString, Map<locale, newValue>>.
  const [pendingEdits, setPendingEdits] = useState<
    Record<string, Record<string, string>>
  >({});
  const [saving, setSaving] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiGeneratingSource, setAiGeneratingSource] = useState<string | null>(
    null
  );
  const aiAbortRef = useRef(false);
  const aiAbortControllerRef = useRef<AbortController | null>(null);
  const pendingEditsCount = Object.keys(pendingEdits).length;

  function updatePendingEdit(source: string, locale: string, value: string) {
    setPendingEdits((prev) => {
      const next = {...prev};
      if (!next[source]) {
        next[source] = {};
      }
      next[source] = {...next[source], [locale]: value};
      // If the value matches the saved value, remove the edit.
      const savedValue = localeTranslations[source] || '';
      if (value === savedValue) {
        delete next[source][locale];
        if (Object.keys(next[source]).length === 0) {
          delete next[source];
        }
      }
      return next;
    });
  }

  async function saveEdits() {
    setSaving(true);
    try {
      const edits = Object.entries(pendingEdits).map(([source, locales]) => ({
        source,
        locales,
      }));
      await batchSaveTranslations(edits, {tags: [props.docId]});
      await mergeSavedTranslations(edits);
      setPendingEdits({});
      showNotification({
        title: 'Saved!',
        message: `Updated ${edits.length} translation(s).`,
        autoClose: 2500,
      });
    } catch (err) {
      console.error(err);
      showNotification({
        title: 'Error saving translations',
        message: String(err),
        color: 'red',
        autoClose: false,
      });
    }
    setSaving(false);
  }

  /**
   * Merges saved edits into the local translations map, including the doc tag
   * so the "missing tags" banner doesn't reappear after saving.
   */
  async function mergeSavedTranslations(
    edits: Array<{source: string; locales: Record<string, string>}>
  ) {
    const hashes = await Promise.all(
      edits.map(async (edit) => ({
        hash: await sourceHash(edit.source),
        source: edit.source,
        locales: edit.locales,
      }))
    );
    const docTags = [props.docId];
    setTranslationsMap((prev) => {
      const next = {...prev};
      for (const {hash, source, locales} of hashes) {
        const existing = next[hash];
        const existingTags: string[] = existing?.tags || [];
        const tags = Array.from(new Set([...existingTags, ...docTags]));
        if (existing) {
          next[hash] = {...existing, ...locales, tags};
        } else {
          next[hash] = {source, ...locales, tags} as any;
        }
      }
      return next;
    });
  }

  function openPortModal(source: string) {
    portModal.open({
      id: props.docId,
      targetSource: source,
      targetTranslations: toLocaleTranslations(sourceToTranslationsMap[source]),
      languages: toTranslationLanguages(
        locales.filter((l) => !isLocaleExcludedFromTranslations(l))
      ),
      loadCandidates: async () => {
        // Candidates are the doc's current strings plus strings tagged with
        // the doc that it no longer uses (e.g. the pre-edit source strings).
        const tagged = await loadTranslations({tags: [props.docId]});
        const currentSources = new Set(sourceStrings);
        const bySource = new Map<string, Translation>();
        [...Object.values(translationsMap), ...Object.values(tagged)].forEach(
          (translation) => {
            if (translation?.source && !bySource.has(translation.source)) {
              bySource.set(translation.source, translation);
            }
          }
        );
        return Array.from(bySource.values()).map((translation) => ({
          source: translation.source,
          translations: toLocaleTranslations(translation),
          label: currentSources.has(translation.source) ? undefined : 'unused',
        }));
      },
      lookupSource: async (lookupSource) => {
        const translation = await getTranslationByHash(
          await sourceHash(lookupSource)
        );
        const translations = toLocaleTranslations(translation);
        return Object.keys(translations).length > 0 ? translations : null;
      },
      onSave: async (translations) => {
        const edits = [{source, locales: translations}];
        await batchSaveTranslations(edits, {tags: [props.docId]});
        await mergeSavedTranslations(edits);
        // Discard any unsaved edits for the ported cells, since the ported
        // translations replace them.
        setPendingEdits((prev) => {
          if (!prev[source]) {
            return prev;
          }
          const remaining = {...prev[source]};
          Object.keys(translations).forEach((lang) => delete remaining[lang]);
          const next = {...prev};
          if (Object.keys(remaining).length > 0) {
            next[source] = remaining;
          } else {
            delete next[source];
          }
          return next;
        });
      },
    });
  }

  function shouldShowAiButton() {
    if (!testAiEnabled() || !selectedLocale) return false;
    // Show if any translations are missing for the selected locale.
    return sourceStrings.some((source) => {
      const pending = pendingEdits[source]?.[selectedLocale];
      if (pending !== undefined) return !pending;
      return !localeTranslations[source];
    });
  }

  function stopAiTranslations() {
    aiAbortRef.current = true;
    aiAbortControllerRef.current?.abort();
  }

  async function generateAiTranslations() {
    if (!selectedLocale || sourceStrings.length === 0) return;
    aiAbortRef.current = false;
    setAiGenerating(true);
    try {
      for (const source of sourceStrings) {
        if (aiAbortRef.current) break;
        // Skip if already has a translation or pending edit.
        const pending = pendingEdits[source]?.[selectedLocale];
        if (pending) continue;
        if (localeTranslations[source]) continue;

        setAiGeneratingSource(source);

        const abortController = new AbortController();
        aiAbortControllerRef.current = abortController;

        const existingTranslations: Record<string, string> = {};
        const row = sourceToTranslationsMap[source];
        if (row) {
          locales.forEach((locale) => {
            if (row[locale]) existingTranslations[locale] = row[locale];
          });
        }

        const res = await window.fetch('/cms/api/ai.translate', {
          method: 'POST',
          headers: {'content-type': 'application/json'},
          body: JSON.stringify({
            sourceText: source,
            targetLocales: [selectedLocale],
            existingTranslations,
          }),
          signal: abortController.signal,
        });

        if (res.status !== 200) {
          const err = await res.text();
          throw new Error(`Translation failed: ${err}`);
        }

        const data = await res.json();
        if (data.success && data.translations?.[selectedLocale]) {
          updatePendingEdit(
            source,
            selectedLocale,
            data.translations[selectedLocale]
          );
        }
      }
      if (!aiAbortRef.current) {
        showNotification({
          message: 'Finished generating AI translations',
          color: 'green',
        });
      } else {
        showNotification({
          message: 'AI translation stopped',
          color: 'yellow',
        });
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // Fetch was aborted by stop button, not an error.
      } else {
        console.error(err);
        showNotification({
          title: 'Error generating translations',
          message: String(err),
          color: 'red',
        });
      }
    } finally {
      setAiGenerating(false);
      setAiGeneratingSource(null);
      aiAbortRef.current = false;
      aiAbortControllerRef.current = null;
    }
  }

  // Recompute missing tags when translationsMap changes (e.g., after save/import).
  // Initial computation is handled in the data loading effect above.
  const initialLoadDone = useRef(false);
  useEffect(() => {
    if (loading) {
      return;
    }
    // Skip the first run after initial load since we already computed.
    if (!initialLoadDone.current) {
      initialLoadDone.current = true;
      return;
    }
    let cancelled = false;
    async function checkMissingTags() {
      const docTags = [props.docId];
      const hashesWithSources = await Promise.all(
        sourceStrings.map(async (source) => ({
          source,
          hash: await sourceHash(source),
        }))
      );
      if (cancelled) return;
      const missing = new Set<string>();
      for (const {source, hash} of hashesWithSources) {
        if (translationsMap[hash]) {
          const existingTags = translationsMap[hash].tags || [];
          const hasTag = docTags.every((t) => existingTags.includes(t));
          if (!hasTag) {
            missing.add(source);
          }
        }
      }
      if (!cancelled) {
        setMissingTagSources(missing);
      }
    }
    checkMissingTags();
    return () => {
      cancelled = true;
    };
  }, [props.docId, sourceStrings, translationsMap, loading]);

  const sourceToTranslationsMap = useMemo(() => {
    const results: {[source: string]: Record<string, string>} = {};
    Object.values(translationsMap).forEach((row: Record<string, string>) => {
      results[row.source] = row;
    });
    return results;
  }, [translationsMap]);

  const localeOptions = translationLanguages.map((locale) => ({
    value: locale,
    label: getLocaleLabel(locale),
  }));

  const missingTranslationsCount = useMemo(() => {
    if (!selectedLocale || sourceStrings.length === 0) return 0;
    return sourceStrings.filter((source) => {
      // Check pending edits first, then fall back to saved translations.
      const pending = pendingEdits[source]?.[selectedLocale];
      if (pending !== undefined) return !pending;
      return !localeTranslations[source];
    }).length;
  }, [sourceStrings, localeTranslations, selectedLocale, pendingEdits]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      extractStringsForDoc(props.docId),
      cmsGetLinkedGoogleSheetL10n(props.docId),
    ])
      .then(async ([sourceStrings, linkedSheet]) => {
        // Hash each source string and load only the matching translations,
        // instead of downloading the project's entire translations collection
        // (which can be very large and is the main cause of slow loads).
        const docTags = [props.docId];
        const hashesWithSources = await Promise.all(
          sourceStrings.map(async (source) => ({
            source,
            hash: await sourceHash(source),
          }))
        );
        const translationsMap = await loadTranslationsByHashes(
          hashesWithSources.map((item) => item.hash)
        );
        // Compute missing tags before showing the UI to prevent flash.
        const missing = new Set<string>();
        for (const {source, hash} of hashesWithSources) {
          if (translationsMap[hash]) {
            const existingTags = translationsMap[hash].tags || [];
            const hasTag = docTags.every((t) => existingTags.includes(t));
            if (!hasTag) {
              missing.add(source);
            }
          }
        }

        setSourceStrings(sourceStrings);
        setTranslationsMap(translationsMap);
        setLinkedSheet(linkedSheet);
        setMissingTagSources(missing);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load translations:', err);
        setLoading(false);
        showNotification({
          title: 'Error',
          message: String(err?.message || err),
          color: 'red',
          autoClose: false,
        });
      });
  }, [props.docId]);

  function getTranslation(source: string, locale: string): string {
    const row = sourceToTranslationsMap[source];
    if (row) {
      return getTranslationForLanguage(row, locale);
    }
    return '';
  }

  function formatCsvData() {
    const nonEnLanguages = toTranslationLanguages(
      locales.filter((l) => !isLocaleExcludedFromTranslations(l))
    ).filter((lang) => lang !== 'en');
    const headers = ['source', 'en', ...nonEnLanguages];
    const rows: Array<Record<string, string>> = [];
    sourceStrings.forEach((source) => {
      const row: Record<string, string> = {
        source: source,
        en: getTranslation(source, 'en') || source,
      };
      nonEnLanguages.forEach((l) => {
        row[l] = getTranslation(source, l);
      });
      rows.push(row);
    });
    return {headers, rows};
  }

  async function downloadCsv() {
    const {headers, rows} = formatCsvData();
    const res = await window.fetch('/cms/api/csv.download', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({headers, rows}),
    });
    if (res.status !== 200) {
      console.error('csv.download failed:');
      const text = await res.text();
      console.error(text);
    }
    const blob = await res.blob();
    const file = window.URL.createObjectURL(blob);
    window.location.assign(file);
    window.URL.revokeObjectURL(file);
  }

  async function importCsv() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.csv';
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (file) {
        if (file.size > MAX_CSV_IMPORT_BYTES) {
          showNotification({
            title: 'Failed to import CSV',
            message: `The maximum file size for a CSV is ${MAX_CSV_IMPORT_LABEL}. Please reduce the size of the file and retry.`,
            color: 'red',
            autoClose: false,
          });
          return;
        }
        try {
          // Send the CSV as a plain-text body rather than multipart/form-data;
          // some deployments sit behind WAFs that block multipart requests.
          // Plain text also keeps the request the same size as the file, which
          // JSON escaping would not.
          const csv = await file.text();
          const res = await fetch('/cms/api/csv.import', {
            method: 'POST',
            headers: {'Content-Type': 'text/plain'},
            body: csv,
          });
          if (res.status !== 200) {
            const errorText = await res.text();
            throw new Error(`RPCError: ${errorText}`);
          }
          const resData = (await res.json()).data;
          const importedTranslations = await cmsDocImportTranslations(
            props.docId,
            resData
          );
          setTranslationsMap((currentTranslations) => {
            return mergeTranslations(currentTranslations, importedTranslations);
          });
          showNotification({
            title: 'Saved!',
            message: `Imported translations for ${props.docId}.`,
            autoClose: 5000,
          });
        } catch (err) {
          console.error(err);
          showNotification({
            title: 'Failed to import CSV',
            message: String(err),
            color: 'red',
            autoClose: false,
          });
        }
      }
    });
    fileInput.click();
  }

  async function exportToLinkedSheet() {
    if (!gapiClient.isLoggedIn()) {
      await gapiClient.login();
    }
    if (!linkedSheet?.spreadsheetId) {
      throw new Error('no sheet linked');
    }
    const gspreadsheet = new GSpreadsheet(linkedSheet.spreadsheetId);
    const gsheet = await gspreadsheet.getSheet(linkedSheet.gid ?? 0);
    if (!gsheet) {
      throw new Error(`sheet not found: ${JSON.stringify(linkedSheet)}`);
    }
    await exportStringsToSheet(gsheet);
    showNotification({
      title: 'Exported strings to Google Sheet',
      message: gsheet.getUrl(),
      autoClose: false,
    });
  }

  async function exportStringsToSheet(
    gsheet: GSheet,
    options?: {isNew?: boolean}
  ) {
    const isNew = options?.isNew || false;
    const {headers, rows} = formatCsvData();
    if (isNew) {
      // Update sheet data.
      await gsheet.replaceSheet(headers, rows);
      // Apply the default styles to the sheet.
      await gsheet.applyL10nTheme();
    } else {
      // Update existing sheet, replacing only cells as needed (keyed by the
      // "source" column). New rows are added to the end of the sheet.
      await gsheet.updateValuesMap(rows, {
        keyedBy: 'source',
        // When exporting strings, avoid overwriting cells where there is an
        // existing translation. If users want to export translations from the
        // CMS to the sheet, they should clear those cells first.
        preserveColumns: translationLanguages,
      });
    }
    logAction('doc.export_to_sheet', {
      metadata: {
        docId: props.docId,
        sheetId: {
          spreadsheetId: gsheet.spreadsheet.spreadsheetId,
          gid: gsheet.gid,
        },
      },
    });
  }

  async function importGoogleSheet() {
    if (!gapiClient.isLoggedIn()) {
      await gapiClient.login();
    }
    if (!linkedSheet?.spreadsheetId) {
      throw new Error('no sheet linked');
    }
    const gspreadsheet = new GSpreadsheet(linkedSheet.spreadsheetId);
    const gsheet = await gspreadsheet.getSheet(linkedSheet.gid ?? 0);
    if (!gsheet) {
      throw new Error(`sheet not found: ${JSON.stringify(linkedSheet)}`);
    }

    console.log('importing google sheet');
    const values = (await gsheet.getValuesMap()) as CsvTranslation[];

    const importedTranslations = await cmsDocImportTranslations(
      props.docId,
      values
    );
    setTranslationsMap((currentTranslations) => {
      return mergeTranslations(currentTranslations, importedTranslations);
    });
    showNotification({
      title: 'Saved!',
      message: `Imported translations for ${props.docId}.`,
      autoClose: 5000,
    });
  }

  async function unlinkGoogleSheet() {
    await cmsUnlinkGoogleSheetL10n(props.docId);
    setLinkedSheet(null);
    showNotification({
      title: 'Unlinked Google Sheet',
      message: `${props.docId} is no longer connected to a Google Sheet.`,
      autoClose: 5000,
    });
  }

  async function applyDocTag() {
    setLoading(true);
    const updates: Array<{hash: string; tags: string[]}> = [];
    const docTags = [props.docId];

    for (const source of sourceStrings) {
      const hash = await sourceHash(source);
      // We can only update tags for strings that have already been translated/imported
      // and thus exist in the translations map.
      if (translationsMap[hash]) {
        const existingTags = translationsMap[hash].tags || [];
        // Create a Set to ensure uniqueness
        const newTags = Array.from(new Set([...existingTags, ...docTags]));
        updates.push({hash, tags: newTags});
      }
    }

    if (updates.length > 0) {
      await batchUpdateTags(updates, {mode: 'union'});

      // Update local state
      setTranslationsMap((prev) => {
        const next = {...prev};
        updates.forEach(({hash, tags}) => {
          if (next[hash]) {
            next[hash] = {...next[hash], tags};
          }
        });
        return next;
      });

      showNotification({
        title: 'Tags Applied',
        message: `Applied tag "${props.docId}" to ${updates.length} string(s).`,
        color: 'green',
      });
    } else {
      showNotification({
        title: 'No strings updated',
        message: 'No existing translations found to tag.',
        color: 'blue',
      });
    }
    setLoading(false);
  }

  /**
   * Wrapper that calls a function and shows a generic error notification if any
   * exceptions occur.
   */
  async function notifyErrors(fn: () => Promise<void>) {
    try {
      await fn();
    } catch (err) {
      console.error(err);
      let msg: string;
      if (typeof err === 'object' && err.body) {
        msg = String(err.body);
      } else {
        msg = String(err);
      }
      showNotification({
        title: 'Error',
        message: msg,
        color: 'red',
        autoClose: false,
      });
    }
  }

  function onAction(action: MenuAction) {
    switch (action) {
      case MenuAction.EXPORT_DOWNLOAD_CSV: {
        notifyErrors(downloadCsv);
        return;
      }
      case MenuAction.EXPORT_GOOGLE_SHEET_LINKED: {
        notifyErrors(exportToLinkedSheet);
        return;
      }
      case MenuAction.EXPORT_GOOGLE_SHEET_SHOW_OPTIONS: {
        exportSheetModal.open({
          docId: props.docId,
          csvData: formatCsvData(),
          locales: translationLanguages,
        });
        return;
      }
      case MenuAction.IMPORT_CSV: {
        notifyErrors(importCsv);
        return;
      }
      case MenuAction.IMPORT_GOOGLE_SHEET_LINKED: {
        notifyErrors(importGoogleSheet);
        return;
      }
      case MenuAction.UNLINK_GOOGLE_SHEET: {
        notifyErrors(unlinkGoogleSheet);
        return;
      }
      default: {
        console.log('unhandled action: ' + action);
      }
    }
  }

  async function onServiceAction(
    serviceId: string,
    action: 'import' | 'export'
  ) {
    const serviceMeta = (window.__ROOT_CTX.translations || []).find(
      (s) => s.id === serviceId
    );
    const serviceLabel = serviceMeta?.label || serviceId;

    await notifyErrors(async () => {
      // Get descriptions for export (translator notes).
      const stringsWithMeta =
        action === 'export'
          ? await extractStringsWithMetadataForDoc(props.docId)
          : null;

      // Build translation row data from current source strings, keyed by
      // translation language.
      const data = sourceStrings.map((source) => {
        const translations: Record<string, string> = {};
        translationLanguages.forEach((locale) => {
          translations[locale] = getTranslation(source, locale) ?? '';
        });
        const description = stringsWithMeta?.get(source)?.description;
        return {
          source,
          translations,
          ...(description ? {description} : {}),
        };
      });

      // Validate action before interpolating it into the URL.
      const safeAction =
        action === 'import' || action === 'export'
          ? action
          : (() => {
              throw new Error('Invalid translations action');
            })();

      const notificationId = `translations-${safeAction}-${serviceId}`;
      showNotification({
        id: notificationId,
        message:
          action === 'import'
            ? `Importing from ${serviceLabel}...`
            : `Exporting to ${serviceLabel}...`,
        loading: true,
        autoClose: false,
        disallowClose: true,
      });

      try {
        const res = await window.fetch(`/cms/api/translations.${safeAction}`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            serviceId,
            docId: props.docId,
            data,
          }),
        });

        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          throw new Error(
            `Unexpected response (${res.status}). Please reload the page and try again.`
          );
        }

        const resData = await res.json();

        if (!resData.success) {
          throw new Error(resData.error || 'Unknown error');
        }

        if (action === 'import') {
          if (Array.isArray(resData.data)) {
            // Convert returned rows to CsvTranslation format for import.
            const importedRows: CsvTranslation[] = resData.data.map(
              (row: {
                source: unknown;
                translations?: Record<string, unknown>;
              }) => {
                const safeRow: CsvTranslation = {
                  source: String(row?.source ?? ''),
                };
                const translations = row?.translations;
                if (translations && typeof translations === 'object') {
                  // Keys may be root locales or translation languages;
                  // `cmsDocImportTranslations()` expands languages to the
                  // root locales they cover.
                  Object.entries(
                    translations as Record<string, unknown>
                  ).forEach(([key, value]) => {
                    if (value === null || value === undefined) {
                      return;
                    }
                    if (getLocalesForTranslationLanguage(key).length === 0) {
                      return;
                    }
                    safeRow[key] = String(value);
                  });
                }
                return safeRow;
              }
            );
            const importedTranslations = await cmsDocImportTranslations(
              props.docId,
              importedRows,
              {
                actionMetadata: {
                  service: serviceId,
                  numStrings: importedRows.length,
                  locales,
                },
                actionLinks: [
                  {
                    label: 'Open translations',
                    url: `/cms/content/${props.docId}?modal=localization`,
                  },
                ],
              }
            );
            setTranslationsMap((currentTranslations) => {
              return mergeTranslations(
                currentTranslations,
                importedTranslations
              );
            });

            // Auto-tag imported translations with the doc ID.
            const docTags = [props.docId];
            const tagUpdates: Array<{hash: string; tags: string[]}> = [];
            for (const row of importedRows) {
              const hash = await sourceHash(row.source);
              const existing = translationsMap[hash];
              const existingTags = existing?.tags || [];
              const newTags = Array.from(
                new Set([...existingTags, ...docTags])
              );
              tagUpdates.push({hash, tags: newTags});
            }
            if (tagUpdates.length > 0) {
              await batchUpdateTags(tagUpdates, {mode: 'union'});
              setTranslationsMap((prev) => {
                const next = {...prev};
                tagUpdates.forEach(({hash, tags}) => {
                  if (next[hash]) {
                    next[hash] = {...next[hash], tags};
                  }
                });
                return next;
              });
            }

            updateNotification({
              id: notificationId,
              title: 'Imported!',
              message: `Imported translations from ${serviceLabel}.`,
              loading: false,
              autoClose: 5000,
            });
          } else {
            // TranslationImportResult: display notification with optional link.
            const importData = resData.data || {};
            const importTitle = importData.title || 'Import complete';
            const importMessage =
              importData.message ||
              `Imported translations from ${serviceLabel}.`;
            const importLink = importData.link;
            updateNotification({
              id: notificationId,
              title: importTitle,
              color:
                importData.status === 'success'
                  ? 'green'
                  : importData.status === 'error'
                    ? 'red'
                    : undefined,
              message: importLink?.url ? (
                <div>
                  <div>{importMessage}</div>
                  <Button
                    href={importLink.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2"
                    iconRight={<IconArrowUpRight />}
                  >
                    {importLink.label || 'Open'}
                  </Button>
                </div>
              ) : (
                importMessage
              ),
              loading: false,
              autoClose: importLink?.url ? 10000 : 5000,
            });
          }
        } else {
          const exportData = resData.data || {};
          const exportTitle = exportData.title || 'Exported!';
          const exportMessage =
            exportData.message || `Exported translations to ${serviceLabel}.`;
          const exportLink = exportData.link;
          updateNotification({
            id: notificationId,
            title: exportTitle,
            color:
              exportData.status === 'success'
                ? 'green'
                : exportData.status === 'error'
                  ? 'red'
                  : undefined,
            message: exportLink?.url ? (
              <div>
                <div>{exportMessage}</div>
                <Button
                  href={exportLink.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2"
                  iconRight={<IconArrowUpRight />}
                >
                  {exportLink.label || 'Open'}
                </Button>
              </div>
            ) : (
              exportMessage
            ),
            loading: false,
            autoClose: exportLink?.url ? 10000 : 5000,
          });
        }
      } catch (err) {
        hideNotification(notificationId);
        throw err;
      }
    });
  }

  return (
    <div className={TRANSLATIONS_PANEL_CLASSES}>
      <div className="LocalizationModal__translationsTopWrapper">
        <div className="LocalizationModal__translationsHeader flex flex-wrap items-start justify-between gap-3 bg-surface pb-2.5 pt-2 md:sticky md:top-0 md:z-(--cms-z-sticky) md:flex-nowrap">
          <div className="LocalizationModal__translationsTitleWrap flex min-w-0 flex-wrap items-center gap-3">
            <Heading
              className="LocalizationModal__translationsTitle LocalizationModal__iconTitle flex items-center gap-2 whitespace-nowrap"
              size="h2"
            >
              <IconLanguage strokeWidth={1.5} /> <span>Translations</span>
            </Heading>
          </div>
          <div className="LocalizationModal__translationsHeaderButtons flex flex-wrap items-center gap-2 md:justify-end">
            {gapiClient.enabled && linkedSheet?.spreadsheetId && (
              <IconButton
                label="Open Google Sheet"
                href={getSpreadsheetUrl(linkedSheet)}
                target="_blank"
                variant="green"
                size="xs"
              >
                <IconTable strokeWidth={2.25} />
              </IconButton>
            )}

            <Button
              href={`/cms/translations/${props.docId}`}
              target="_blank"
              iconRight={<IconArrowUpRight strokeWidth={1.75} />}
            >
              Open Editor
            </Button>
            <ImportMenuButton
              onAction={onAction}
              onServiceAction={onServiceAction}
              gapiClient={gapiClient}
              linkedSheet={linkedSheet}
            />
            <ExportMenuButton
              onAction={onAction}
              onServiceAction={onServiceAction}
              gapiClient={gapiClient}
              linkedSheet={linkedSheet}
            />
            <Menu
              className="LocalizationModal__translationsMenu"
              placement="bottom-end"
              width={220}
              trigger={
                <IconButton
                  className="LocalizationModal__translationsMenuDots"
                  label="Tools"
                  variant="default"
                >
                  <IconTool />
                </IconButton>
              }
            >
              <MenuItem
                className="LocalizationModal__translationsMenuItem"
                icon={<IconScissors />}
                onClick={() =>
                  pruneModal.open({
                    docId: props.docId,
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
        {loading && (
          <ProgressiveLoader
            labels={[
              'Transmogrifying...',
              'Deciphering the vibes...',
              'Consulting the Rosetta Stone...',
              'Untangling the syntax...',
              'Babel-ing...',
            ]}
          />
        )}
        {!loading && missingTagsCount > 0 && (
          <div className="LocalizationModal__missingTags mb-4 flex flex-wrap items-center justify-between gap-2 rounded-sm border border-solid border-warning-line bg-warning-soft p-2 text-fg">
            <div className="LocalizationModal__missingTagsMessage flex items-center gap-4">
              <IconAlertTriangle className="shrink-0 text-warning" />
              {missingTagsCount > 1 ? (
                <p className="m-0 text-base">
                  <b>{missingTagsCount} strings</b> are missing the "
                  {props.docId}" tag.
                </p>
              ) : (
                <p className="m-0 text-base">
                  <b>{missingTagsCount} string</b> is missing the "{props.docId}
                  " tag.
                </p>
              )}
            </div>
            <Button
              variant="blue"
              onClick={() => notifyErrors(applyDocTag)}
              loading={loading}
              icon={<IconTool />}
            >
              Fix missing tags
            </Button>
          </div>
        )}
        {!loading && (
          <table className="LocalizationModal__translationsTable mb-3 flex w-full flex-col">
            <tr className="LocalizationModal__translationsTableRow LocalizationModal__translationsTableRow--header mb-2.5 grid min-w-0 grid-cols-1 items-center border-0 border-b border-solid border-border bg-surface pb-2 md:sticky md:top-12 md:z-(--cms-z-sticky) md:grid-cols-2">
              <th
                className={cn(
                  TABLE_CELL_CLASSES,
                  'LocalizationModal__translationsTableHeader hidden md:block'
                )}
              >
                <Heading size="h4" weight="semi-bold">
                  SOURCE STRING
                </Heading>
              </th>
              <th
                className={cn(
                  TABLE_CELL_CLASSES,
                  'LocalizationModal__translationsTableHeader'
                )}
              >
                <div className="LocalizationModal__translationsLocaleHeader flex flex-wrap items-center justify-between gap-2">
                  <Heading
                    className="LocalizationModal__translationsLocaleSelect flex items-center gap-2 whitespace-nowrap"
                    size="h4"
                    weight="semi-bold"
                  >
                    <span>LOCALE: </span>{' '}
                    <Select
                      className="w-44"
                      aria-label="Locale"
                      data={localeOptions}
                      size="xs"
                      placeholder="select locale"
                      allowDeselect
                      value={selectedLocale}
                      onValueChange={(value) =>
                        setSelectedLocale(value as string)
                      }
                    />
                  </Heading>
                  <div className="flex shrink-0 items-center gap-2">
                    {selectedLocale && missingTranslationsCount > 0 && (
                      <Tooltip
                        key={filterMissing ? 'active' : 'inactive'}
                        label={
                          filterMissing
                            ? 'Show all translations'
                            : 'Show only missing translations'
                        }
                      >
                        <button
                          type="button"
                          aria-pressed={filterMissing}
                          className="LocalizationModal__translationsMissingToggle m-0 flex shrink-0 cursor-pointer appearance-none items-center gap-1 whitespace-nowrap rounded-sm border border-solid border-transparent bg-transparent px-2 py-0.5 font-sans text-sm font-bold text-strong hover:bg-surface-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-pressed:border-info-line aria-pressed:bg-info-soft aria-pressed:text-info"
                          onClick={() => setFilterMissing((v) => !v)}
                        >
                          <IconFilter size={14} />
                          <span>{missingTranslationsCount} missing</span>
                        </button>
                      </Tooltip>
                    )}
                    {selectedLocale &&
                      sourceStrings.length > 0 &&
                      missingTranslationsCount === 0 &&
                      pendingEditsCount === 0 && (
                        <div className="LocalizationModal__translationsFullyTranslated flex shrink-0 items-center gap-1 whitespace-nowrap text-sm font-bold text-success">
                          <IconCheck
                            size={14}
                            className="rounded-full bg-success p-0.5 text-inverse"
                          />
                          <span>Translated</span>
                        </div>
                      )}
                    {shouldShowAiButton() && !aiGenerating && (
                      <IconButton
                        label="Generate translations using AI"
                        variant="default"
                        size="xs"
                        onClick={generateAiTranslations}
                      >
                        <IconRobot />
                      </IconButton>
                    )}
                    {aiGenerating && (
                      <IconButton
                        label="Stop generating"
                        variant="default"
                        size="xs"
                        onClick={stopAiTranslations}
                      >
                        <IconPlayerStop fill="currentColor" />
                      </IconButton>
                    )}
                    {aiGenerating && (
                      <Spinner
                        label="Generating translations"
                        className="LocalizationModal__spinner text-muted"
                      />
                    )}
                  </div>
                </div>
              </th>
            </tr>
            {sourceStrings
              .filter((source) => {
                if (!filterMissing || !selectedLocale) return true;
                return !localeTranslations[source];
              })
              .map((source, i) => (
                <tr
                  className={cn(
                    'LocalizationModal__translationsTableRow grid min-w-0 grid-cols-1 gap-2 md:grid-cols-2 md:gap-0',
                    i > 0 &&
                      'mt-3 border-0 border-t border-solid border-border pt-3'
                  )}
                  key={i}
                >
                  <td
                    className={cn(
                      TABLE_CELL_CLASSES,
                      'LocalizationModal__translationsTableCol'
                    )}
                  >
                    <div className="LocalizationModal__sourceCell group relative h-full rounded-sm border border-solid border-border bg-surface-hover px-5 py-2.5 pr-20 leading-snug md:pr-5">
                      <span className="LocalizationModal__sourceCellText whitespace-pre-wrap text-sm">
                        {source}
                      </span>
                      <div className="LocalizationModal__sourceCellIcons absolute right-1 top-1 flex shrink-0 items-center gap-1">
                        <IconButton
                          className={cn(
                            SOURCE_CELL_ACTION_CLASSES,
                            'LocalizationModal__sourceCellPort'
                          )}
                          label="Port translations from another string"
                          variant="default"
                          size="xs"
                          onClick={() => openPortModal(source)}
                        >
                          <IconArrowsTransferDown />
                        </IconButton>
                        {sourceToTranslationsMap[source] && (
                          <IconButton
                            className={cn(
                              SOURCE_CELL_ACTION_CLASSES,
                              'LocalizationModal__sourceCellLink'
                            )}
                            label="Open translation"
                            tooltip={false}
                            variant="default"
                            size="xs"
                            onClick={async () => {
                              const hash = await sourceHash(source);
                              window.open(
                                `/cms/translations/${hash}`,
                                '_blank'
                              );
                            }}
                          >
                            <IconExternalLink />
                          </IconButton>
                        )}
                        {missingTagSources.has(source) && (
                          <Tooltip label={`Missing "${props.docId}" tag`}>
                            <span
                              className="LocalizationModal__sourceCellMissingTag flex size-control-xs items-center justify-center rounded-sm border border-solid border-border-strong bg-surface text-warning"
                              role="img"
                              aria-label={`Missing "${props.docId}" tag`}
                            >
                              <IconAlertTriangle size={14} />
                            </span>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                  </td>
                  <td
                    className={cn(
                      TABLE_CELL_CLASSES,
                      'LocalizationModal__translationsTableCol'
                    )}
                  >
                    <TranslationCell
                      source={source}
                      locale={selectedLocale}
                      savedValue={localeTranslations[source] || ''}
                      pendingValue={pendingEdits[source]?.[selectedLocale]}
                      isAiGenerating={aiGeneratingSource === source}
                      readOnly={aiGenerating}
                      onEdit={(value) =>
                        updatePendingEdit(source, selectedLocale, value)
                      }
                    />
                  </td>
                </tr>
              ))}
          </table>
        )}
      </div>
      <DialogFooter>
        <span className="LocalizationModal__translationsSaveBarStatus text-sm text-strong">
          {pendingEditsCount > 0
            ? `${pendingEditsCount} unsaved change${
                pendingEditsCount !== 1 ? 's' : ''
              }`
            : ''}
        </span>
        {pendingEditsCount > 0 && (
          <Button
            icon={<IconArrowBackUp />}
            onClick={() => setPendingEdits({})}
          >
            Discard changes
          </Button>
        )}
        <Button
          variant="primary"
          icon={<IconCheck />}
          onClick={saveEdits}
          loading={saving}
          disabled={pendingEditsCount === 0}
        >
          Save
        </Button>
      </DialogFooter>
    </div>
  );
};

/** Classes shared by the translations table's header and body cells. */
const TABLE_CELL_CLASSES =
  'min-w-0 break-words p-0 text-left font-normal md:px-2';

/**
 * The source cell's port and link buttons: always visible on mobile, and
 * revealed on hover or focus from `md` up.
 */
const SOURCE_CELL_ACTION_CLASSES =
  'md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100';

interface TranslationCellProps {
  source: string;
  locale: string;
  savedValue: string;
  pendingValue?: string;
  isAiGenerating?: boolean;
  readOnly?: boolean;
  onEdit: (value: string) => void;
}

function TranslationCell(props: TranslationCellProps) {
  const value =
    props.pendingValue !== undefined ? props.pendingValue : props.savedValue;
  const isEdited = props.pendingValue !== undefined;

  return (
    <Textarea
      size="xs"
      autosize
      minRows={1}
      value={value}
      placeholder=""
      aria-label={`Translation for "${props.source}"`}
      readOnly={props.readOnly}
      onInput={(e) => props.onEdit(e.currentTarget.value)}
      className={cn(
        'LocalizationModal__translationsCell min-h-full',
        isEdited && 'LocalizationModal__translationsCell--edited',
        props.isAiGenerating &&
          'LocalizationModal__translationsCell--aiGenerating',
        !value && 'LocalizationModal__translationsCell--empty',
        !value && 'bg-danger-soft',
        isEdited && 'border-focus bg-info-soft',
        props.isAiGenerating && 'border-accent bg-surface-hover'
      )}
    />
  );
}

interface MenuButtonProps {
  gapiClient: GapiClient;
  linkedSheet: GoogleSheetId | null;
  onAction?: (action: MenuAction) => void;
  onServiceAction?: (serviceId: string, action: 'import' | 'export') => void;
}

function ImportMenuButton(props: MenuButtonProps) {
  function dispatch(action: MenuAction) {
    if (props.onAction) {
      props.onAction(action);
    }
  }

  const linkedSheet = props.linkedSheet;
  const translationServices = (window.__ROOT_CTX.translations || []).filter(
    (s) => s.hasImport
  );

  return (
    <Menu
      className="LocalizationModal__translationsMenu"
      placement="bottom-end"
      trigger={
        <Button
          icon={<IconFileUpload strokeWidth={1.75} />}
          iconRight={<IconChevronDown strokeWidth={1.75} />}
        >
          Import
        </Button>
      }
    >
      {props.gapiClient.enabled && (
        <>
          <MenuGroup label="Google Sheets">
            <MenuItem
              className="LocalizationModal__translationsMenuItem"
              disabled={!linkedSheet?.spreadsheetId}
              onClick={() => dispatch(MenuAction.IMPORT_GOOGLE_SHEET_LINKED)}
            >
              Import Google Sheet
            </MenuItem>
          </MenuGroup>
          <MenuDivider />
        </>
      )}
      <MenuGroup label="File">
        <MenuItem
          className="LocalizationModal__translationsMenuItem"
          onClick={() => dispatch(MenuAction.IMPORT_CSV)}
        >
          Import .csv
        </MenuItem>
      </MenuGroup>
      {translationServices.length > 0 && (
        <>
          <MenuDivider />
          <MenuGroup label="Services">
            {translationServices.map((service) => (
              <MenuItem
                key={service.id}
                className="LocalizationModal__translationsMenuItem"
                icon={
                  service.icon ? (
                    <img
                      className="size-4"
                      src={service.icon}
                      alt={service.label}
                    />
                  ) : undefined
                }
                onClick={() => props.onServiceAction?.(service.id, 'import')}
              >
                Import from {service.label}
              </MenuItem>
            ))}
          </MenuGroup>
        </>
      )}
    </Menu>
  );
}

function ExportMenuButton(props: MenuButtonProps) {
  async function dispatch(action: MenuAction) {
    if (props.onAction) {
      props.onAction(action);
    }
  }

  const linkedSheet = props.linkedSheet;
  const hasLinkedSheet = !!linkedSheet?.spreadsheetId;
  const translationServices = (window.__ROOT_CTX.translations || []).filter(
    (s) => s.hasExport
  );

  return (
    <Menu
      className="LocalizationModal__translationsMenu"
      placement="bottom-start"
      trigger={
        <Button
          icon={<IconFileDownload strokeWidth={1.75} />}
          iconRight={<IconChevronDown strokeWidth={1.75} />}
        >
          Export
        </Button>
      }
    >
      {props.gapiClient.enabled && (
        <>
          <MenuGroup label="Google Sheets">
            {hasLinkedSheet ? (
              <MenuItem
                className="LocalizationModal__translationsMenuItem"
                onClick={() => dispatch(MenuAction.EXPORT_GOOGLE_SHEET_LINKED)}
              >
                Export to Google Sheet
              </MenuItem>
            ) : (
              <MenuItem
                className="LocalizationModal__translationsMenuItem"
                onClick={() =>
                  dispatch(MenuAction.EXPORT_GOOGLE_SHEET_SHOW_OPTIONS)
                }
              >
                Export to Google Sheet
              </MenuItem>
            )}
          </MenuGroup>
          <MenuDivider />
        </>
      )}
      <MenuGroup label="File">
        <MenuItem
          className="LocalizationModal__translationsMenuItem"
          onClick={() => dispatch(MenuAction.EXPORT_DOWNLOAD_CSV)}
        >
          Download .csv
        </MenuItem>
      </MenuGroup>
      {translationServices.length > 0 && (
        <>
          <MenuDivider />
          <MenuGroup label="Services">
            {translationServices.map((service) => (
              <MenuItem
                key={service.id}
                className="LocalizationModal__translationsMenuItem"
                icon={
                  service.icon ? (
                    <img
                      className="size-4"
                      src={service.icon}
                      alt={service.label}
                    />
                  ) : undefined
                }
                onClick={() => props.onServiceAction?.(service.id, 'export')}
              >
                Export to {service.label}
              </MenuItem>
            ))}
          </MenuGroup>
        </>
      )}
      {hasLinkedSheet && (
        <>
          <MenuDivider />
          <MenuGroup label="Danger zone">
            <MenuItem
              className="LocalizationModal__translationsMenuItem"
              onClick={() => dispatch(MenuAction.UNLINK_GOOGLE_SHEET)}
              danger
            >
              Unlink Google Sheet
            </MenuItem>
          </MenuGroup>
        </>
      )}
    </Menu>
  );
}

/**
 * Merges imported translations into the existing map, preserving fields like
 * `tags` that may exist on the current entries but not on the imports.
 */
function mergeTranslations(
  current: TranslationsMap,
  imported: TranslationsMap
): TranslationsMap {
  const merged = {...current};
  for (const [hash, importedEntry] of Object.entries(imported)) {
    const existing = merged[hash];
    merged[hash] = existing ? {...existing, ...importedEntry} : importedEntry;
  }
  return merged;
}

function getLocaleLabel(locale: string) {
  const parts = locale.split('_');
  const langCode = parts[0];

  // For locales like `ALL_de`, display the country name.
  if (langCode === 'ALL') {
    const countryCode = String(parts[1]).toUpperCase();
    const countryNames = new Intl.DisplayNames(['en'], {
      type: 'region',
    });
    const countryName = countryNames.of(countryCode) || locale;
    return `${countryName} (${locale})`;
  }

  const langNames = new Intl.DisplayNames(['en'], {
    type: 'language',
  });
  const langName = langNames.of(langCode) || locale;
  return `${langName} (${locale})`;
}
