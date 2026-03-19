import {
  ActionIcon,
  Button,
  Checkbox,
  Divider,
  Group,
  Menu,
  Select,
  Stack,
  Text,
  Textarea,
  Tooltip,
} from '@mantine/core';
import {ContextModalProps, useModals} from '@mantine/modals';
import {showNotification} from '@mantine/notifications';
import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconCheck,
  IconChevronDown,
  IconExternalLink,
  IconFileDownload,
  IconFileUpload,
  IconFilter,
  IconLanguage,
  IconLoader2,
  IconMapPin,
  IconTable,
  IconTool,
  IconPlayerStop,
  IconSparkles,
} from '@tabler/icons-preact';
import {useEffect, useMemo, useRef, useState} from 'preact/hooks';
import * as schema from '../../../core/schema.js';
import {DraftDocController} from '../../hooks/useDraftDoc.js';
import {GapiClient, useGapiClient} from '../../hooks/useGapiClient.js';
import {useModalTheme} from '../../hooks/useModalTheme.js';
import {logAction} from '../../utils/actions.js';
import {
  CsvTranslation,
  cmsDocImportTranslations,
  cmsGetLinkedGoogleSheetL10n,
  cmsUnlinkGoogleSheetL10n,
} from '../../utils/doc.js';
import {extractStringsForDoc} from '../../utils/extract.js';
import {
  GSheet,
  GSpreadsheet,
  GoogleSheetId,
  getSpreadsheetUrl,
} from '../../utils/gsheets.js';
import {
  batchSaveTranslations,
  batchUpdateTags,
  sourceHash,
} from '../../utils/l10n.js';
import {TranslationsMap, loadTranslations} from '../../utils/l10n.js';
import {useExportSheetModal} from '../ExportSheetModal/ExportSheetModal.js';
import {Heading} from '../Heading/Heading.js';
import {ProgressiveLoader} from '../ProgressiveLoader/ProgressiveLoader.js';
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
  const modalTheme = useModalTheme();
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
        ...modalTheme,
        innerProps: innerProps,
        size: 'clamp(80%, 1024px, 1280px)',
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
  return (
    <div className="LocalizationModal">
      <div className="LocalizationModal__layout">
        <LocalizationModal.ConfigLocales {...props} />
        <LocalizationModal.Translations {...props} />
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
    <div className="LocalizationModal__locales">
      <Stack spacing={30}>
        <Group>
          <Heading
            className="LocalizationModal__iconTitle LocalizationModal__locales__title"
            size="h2"
          >
            <IconMapPin strokeWidth={1.5} />
            <span>Locales</span>
          </Heading>
          <LocalizationModal.AllNoneButtons
            onAllClicked={() => updateEnabledLocales(i18nLocales)}
            onNoneClicked={() => updateEnabledLocales([])}
          />
        </Group>
        <Stack spacing={40}>
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
        </Stack>
      </Stack>
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
    <Stack spacing={16}>
      {props.group.label && (
        <Group position="apart">
          <Heading size="h4" weight="semi-bold">
            {props.group.label}
          </Heading>
          <LocalizationModal.AllNoneButtons
            onAllClicked={() => setEnabledLocales(groupLocales)}
            onNoneClicked={() => setEnabledLocales([])}
          />
        </Group>
      )}
      <Group>
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
              size="xs"
            />
          );
        })}
      </Group>
    </Stack>
  );
};

interface AllNoneButtonsProps {
  onAllClicked?: () => void;
  onNoneClicked?: () => void;
}

LocalizationModal.AllNoneButtons = (props: AllNoneButtonsProps) => {
  return (
    <Group spacing="8px">
      <Button
        className="LocalizationModal__allNoneBtn"
        variant="subtle"
        size="xs"
        compact
        onClick={props.onAllClicked}
      >
        All
      </Button>
      /
      <Button
        className="LocalizationModal__allNoneBtn"
        variant="subtle"
        size="xs"
        compact
        onClick={props.onNoneClicked}
      >
        None
      </Button>
    </Group>
  );
};

interface TranslationsProps {
  collection: schema.Collection;
  docId: string;
  locale?: string;
}

LocalizationModal.Translations = (props: TranslationsProps) => {
  const [loading, setLoading] = useState(true);
  const [sourceStrings, setSourceStrings] = useState<string[]>([]);
  const locales = window.__ROOT_CTX.rootConfig.i18n?.locales || [];
  const defaultLocale = props.locale || locales.find((l) => l !== 'en') || 'en';
  const [selectedLocale, setSelectedLocale] = useState(defaultLocale);
  const [filterMissing, setFilterMissing] = useState(false);
  const [translationsMap, setTranslationsMap] = useState<TranslationsMap>({});
  const localeTranslations = useMemo(() => {
    if (!selectedLocale) return {};
    const result: Record<string, string> = {};
    Object.values(translationsMap).forEach(
      (translation: Record<string, string>) => {
        result[translation.source] = translation[selectedLocale] || '';
      }
    );
    return result;
  }, [selectedLocale, translationsMap]);
  const gapiClient = useGapiClient();
  const [linkedSheet, setLinkedSheet] = useState<GoogleSheetId | null>(null);
  const exportSheetModal = useExportSheetModal();
  const [missingTagsCount, setMissingTagsCount] = useState(0);
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
      // Merge edits into local translationsMap state.
      const hashes = await Promise.all(
        edits.map(async (edit) => ({
          hash: await sourceHash(edit.source),
          source: edit.source,
          locales: edit.locales,
        }))
      );
      // Merge saved edits into local state, including the doc tag so the
      // "missing tags" banner doesn't reappear after saving.
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

  function shouldShowAiButton() {
    const experiments = (window as any).__ROOT_CTX?.experiments || {};
    const aiEnabled = !!experiments.ai;
    if (!aiEnabled || !selectedLocale) return false;
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

  useEffect(() => {
    let cancelled = false;
    async function checkMissingTags() {
      if (loading) {
        return;
      }
      const docTags = [props.docId];
      // Batch all hash computations in parallel for better performance.
      const hashes = await Promise.all(
        sourceStrings.map((source) => sourceHash(source))
      );
      if (cancelled) return;
      let count = 0;
      for (const hash of hashes) {
        if (translationsMap[hash]) {
          const existingTags = translationsMap[hash].tags || [];
          const hasTag = docTags.every((t) => existingTags.includes(t));
          if (!hasTag) {
            count += 1;
          }
        }
      }
      if (!cancelled) {
        setMissingTagsCount(count);
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

  const localeOptions = locales.map((locale) => ({
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
      loadTranslations(),
      cmsGetLinkedGoogleSheetL10n(props.docId),
    ]).then(([sourceStrings, translationsMap, linkedSheet]) => {
      setSourceStrings(sourceStrings);
      setTranslationsMap(translationsMap);
      setLinkedSheet(linkedSheet);
      setLoading(false);
    });
  }, [props.docId]);

  function getTranslation(source: string, locale: string): string {
    const row = sourceToTranslationsMap[source];
    if (row) {
      return row[locale] || '';
    }
    return '';
  }

  function formatCsvData() {
    const nonEnLocales = locales.filter((l) => l !== 'en');
    const headers = ['source', 'en', ...nonEnLocales];
    const rows: Array<Record<string, string>> = [];
    sourceStrings.forEach((source) => {
      const row: Record<string, string> = {
        source: source,
        en: getTranslation(source, 'en') || source,
      };
      nonEnLocales.forEach((l) => {
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
        const formData = new FormData();
        formData.append('file', file);
        try {
          const res = await fetch('/cms/api/csv.import', {
            method: 'POST',
            body: formData,
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
        preserveColumns: locales,
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
      await batchUpdateTags(updates);

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
          locales: locales,
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

  return (
    <div className="LocalizationModal__translations">
      <div className="LocalizationModal__translations__header">
        <div className="LocalizationModal__translations__titleWrap">
          <Heading
            className="LocalizationModal__translations__title LocalizationModal__iconTitle"
            size="h2"
          >
            <IconLanguage strokeWidth={1.5} /> <span>Translations</span>
          </Heading>
        </div>
        <div className="LocalizationModal__translations__header__buttons">
          <Button
            component="a"
            href={`/cms/translations/${props.docId}`}
            target="_blank"
            variant="default"
            size="xs"
            rightIcon={<IconExternalLink size={14} strokeWidth={1.75} />}
          >
            Open Editor
          </Button>
          {gapiClient.enabled && linkedSheet?.spreadsheetId && (
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
          )}
          <ImportMenuButton
            onAction={onAction}
            gapiClient={gapiClient}
            linkedSheet={linkedSheet}
          />
          <ExportMenuButton
            onAction={onAction}
            gapiClient={gapiClient}
            linkedSheet={linkedSheet}
          />
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
        <div className="LocalizationModal__missingTags">
          <div className="LocalizationModal__missingTags__message">
            <IconAlertTriangle />
            {missingTagsCount > 1 ? (
              <Text size="sm">
                <b>{missingTagsCount} strings</b> are missing the "{props.docId}
                " tag.
              </Text>
            ) : (
              <Text size="sm">
                <b>{missingTagsCount} string</b> is missing the "{props.docId}"
                tag.
              </Text>
            )}
          </div>
          <Button
            variant="filled"
            size="xs"
            onClick={() => notifyErrors(applyDocTag)}
            loading={loading}
            leftIcon={<IconTool size={16} />}
          >
            Fix missing tags
          </Button>
        </div>
      )}

      {!loading && (
        <table className="LocalizationModal__translations__table">
          <tr className="LocalizationModal__translations__table__row LocalizationModal__translations__table__row--header">
            <th className="LocalizationModal__translations__table__header">
              <Heading size="h4" weight="semi-bold">
                SOURCE STRING
              </Heading>
            </th>
            <th className="LocalizationModal__translations__table__header">
              <div className="LocalizationModal__translations__localeHeader">
                <Heading
                  className="LocalizationModal__translations__localeSelect"
                  size="h4"
                  weight="semi-bold"
                >
                  <span>LOCALE: </span>{' '}
                  <Select
                    data={localeOptions}
                    size="xs"
                    placeholder="select locale"
                    allowDeselect
                    value={selectedLocale}
                    onChange={(value: string) => setSelectedLocale(value)}
                  />
                </Heading>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexShrink: 0,
                  }}
                >
                  {selectedLocale && missingTranslationsCount > 0 && (
                    <Tooltip
                      key={filterMissing ? 'active' : 'inactive'}
                      label={
                        filterMissing
                          ? 'Show all translations'
                          : 'Show only missing translations'
                      }
                      position="top"
                      withArrow
                    >
                      <button
                        className={`LocalizationModal__translations__missingToggle${
                          filterMissing
                            ? ' LocalizationModal__translations__missingToggle--active'
                            : ''
                        }`}
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
                      <div className="LocalizationModal__translations__fullyTranslated">
                        <IconCheck size={14} />
                        <span>Translated</span>
                      </div>
                    )}
                  {shouldShowAiButton() && !aiGenerating && (
                    <Tooltip
                      label="Generate translations using AI"
                      withArrow
                      position="top"
                    >
                      <ActionIcon
                        className="LocalizationModal__aiBtn"
                        variant="outline"
                        onClick={generateAiTranslations}
                      >
                        <IconSparkles
                          size={16}
                          fill="currentColor"
                          stroke={1.5}
                        />
                      </ActionIcon>
                    </Tooltip>
                  )}
                  {aiGenerating && (
                    <Tooltip label="Stop generating" withArrow position="top">
                      <ActionIcon
                        className="LocalizationModal__aiBtn"
                        variant="outline"
                        onClick={stopAiTranslations}
                      >
                        <IconPlayerStop size={16} fill="currentColor" />
                      </ActionIcon>
                    </Tooltip>
                  )}
                  {aiGenerating && (
                    <IconLoader2
                      size={18}
                      className="LocalizationModal__spinner"
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
                className="LocalizationModal__translations__table__row"
                key={i}
              >
                <td className="LocalizationModal__translations__table__col">
                  <div className="LocalizationModal__sourceCell">
                    <span className="LocalizationModal__sourceCell__text">
                      {source}
                    </span>
                    {sourceToTranslationsMap[source] && (
                      <ActionIcon
                        className="LocalizationModal__sourceCell__link"
                        size="sm"
                        variant="subtle"
                        onClick={async () => {
                          const hash = await sourceHash(source);
                          window.open(`/cms/translations/${hash}`, '_blank');
                        }}
                      >
                        <IconExternalLink size={16} />
                      </ActionIcon>
                    )}
                  </div>
                </td>
                <td className="LocalizationModal__translations__table__col">
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

      <div className="LocalizationModal__translations__saveBar">
        <span className="LocalizationModal__translations__saveBar__status">
          {pendingEditsCount > 0
            ? `${pendingEditsCount} unsaved change${
                pendingEditsCount !== 1 ? 's' : ''
              }`
            : ''}
        </span>
        {pendingEditsCount > 0 && (
          <Button
            variant="default"
            size="xs"
            leftIcon={<IconArrowBackUp size={14} />}
            onClick={() => setPendingEdits({})}
          >
            Discard changes
          </Button>
        )}
        <Button
          variant="filled"
          size="xs"
          color="dark"
          leftIcon={<IconCheck size={14} />}
          onClick={saveEdits}
          loading={saving}
          disabled={pendingEditsCount === 0}
        >
          Save
        </Button>
      </div>
    </div>
  );
};

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

  const classNames =
    [
      isEdited ? 'LocalizationModal__translations__cell--edited' : '',
      props.isAiGenerating
        ? 'LocalizationModal__translations__cell--ai-generating'
        : '',
      !value ? 'LocalizationModal__translations__cell--empty' : '',
    ]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <Textarea
      size="xs"
      autosize
      minRows={1}
      value={value}
      placeholder=""
      readOnly={props.readOnly}
      onChange={(e: any) => props.onEdit(e.currentTarget.value)}
      className={classNames}
      styles={{
        root: {
          height: '100%',
        },
        wrapper: {
          height: '100%',
        },
        input: {
          fontSize: '12px',
          minHeight: '100%',
        },
      }}
    />
  );
}

interface MenuButtonProps {
  gapiClient: GapiClient;
  linkedSheet: GoogleSheetId | null;
  onAction?: (action: MenuAction) => void;
}

function ImportMenuButton(props: MenuButtonProps) {
  function dispatch(action: MenuAction) {
    if (props.onAction) {
      props.onAction(action);
    }
  }

  const linkedSheet = props.linkedSheet;

  return (
    <Menu
      className="LocalizationModal__translations__menu"
      position="bottom"
      placement="end"
      control={
        <Button
          variant="default"
          color="dark"
          size="xs"
          leftIcon={<IconFileUpload size={16} strokeWidth={1.75} />}
          rightIcon={<IconChevronDown size={16} strokeWidth={1.75} />}
        >
          Import
        </Button>
      }
    >
      {props.gapiClient.enabled && (
        <>
          <Menu.Label>Google Sheets</Menu.Label>
          <Menu.Item
            className="LocalizationModal__translations__menu__item"
            disabled={!linkedSheet?.spreadsheetId}
            onClick={() => dispatch(MenuAction.IMPORT_GOOGLE_SHEET_LINKED)}
          >
            Import Google Sheet
          </Menu.Item>
          <Divider />
        </>
      )}
      <Menu.Label>File</Menu.Label>
      <Menu.Item
        className="LocalizationModal__translations__menu__item"
        onClick={() => dispatch(MenuAction.IMPORT_CSV)}
      >
        Import .csv
      </Menu.Item>
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

  return (
    <Menu
      className="LocalizationModal__translations__menu"
      position="bottom"
      placement="start"
      control={
        <Button
          variant="default"
          color="dark"
          size="xs"
          leftIcon={<IconFileDownload size={16} strokeWidth={1.75} />}
          rightIcon={<IconChevronDown size={16} strokeWidth={1.75} />}
        >
          Export
        </Button>
      }
    >
      {props.gapiClient.enabled && (
        <>
          <Menu.Label>Google Sheets</Menu.Label>
          {hasLinkedSheet ? (
            <>
              <Menu.Item
                className="LocalizationModal__translations__menu__item"
                onClick={() => dispatch(MenuAction.EXPORT_GOOGLE_SHEET_LINKED)}
              >
                Export to Google Sheet
              </Menu.Item>
            </>
          ) : (
            <>
              <Menu.Item
                className="LocalizationModal__translations__menu__item"
                onClick={() =>
                  dispatch(MenuAction.EXPORT_GOOGLE_SHEET_SHOW_OPTIONS)
                }
              >
                Export to Google Sheet
              </Menu.Item>
              {/* <Menu.Item
                className="LocalizationModal__translations__menu__item"
                onClick={() => dispatch(MenuAction.EXPORT_GOOGLE_SHEET_ADD_TAB)}
              >
                Add tab in Google Sheet
              </Menu.Item> */}
            </>
          )}
          <Divider />
        </>
      )}
      <Menu.Label>File</Menu.Label>
      <Menu.Item
        className="LocalizationModal__translations__menu__item"
        onClick={() => dispatch(MenuAction.EXPORT_DOWNLOAD_CSV)}
      >
        Download .csv
      </Menu.Item>
      {hasLinkedSheet && (
        <>
          <Divider />
          <Menu.Label>Danger zone</Menu.Label>
          <Menu.Item
            className="LocalizationModal__translations__menu__item"
            onClick={() => dispatch(MenuAction.UNLINK_GOOGLE_SHEET)}
            color="red"
          >
            Unlink Google Sheet
          </Menu.Item>
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
