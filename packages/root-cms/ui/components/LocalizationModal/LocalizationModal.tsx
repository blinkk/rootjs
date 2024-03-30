import {
  ActionIcon,
  Box,
  Button,
  Checkbox,
  Divider,
  Group,
  Loader,
  Menu,
  Select,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import {ContextModalProps, useModals} from '@mantine/modals';
import {showNotification} from '@mantine/notifications';
import {
  IconChevronDown,
  IconFileDownload,
  IconFileUpload,
  IconLanguage,
  IconMapPin,
  IconTable,
} from '@tabler/icons-preact';
import {doc, getDoc} from 'firebase/firestore';
import {useEffect, useMemo, useState} from 'preact/hooks';
import * as schema from '../../../core/schema.js';
import {DraftController} from '../../hooks/useDraft.js';
import {GapiClient, useGapiClient} from '../../hooks/useGapiClient.js';
import {useModalTheme} from '../../hooks/useModalTheme.js';
import {
  CsvTranslation,
  cmsDocImportCsv,
  cmsGetLinkedGoogleSheetL10n,
  cmsUnlinkGoogleSheetL10n,
} from '../../utils/doc.js';
import {extractFields} from '../../utils/extract.js';
import {
  GSheet,
  GSpreadsheet,
  GoogleSheetId,
  getSpreadsheetUrl,
} from '../../utils/gsheets.js';
import {TranslationsMap, loadTranslations} from '../../utils/l10n.js';
import {useExportSheetModal} from '../ExportSheetModal/ExportSheetModal.js';
import {Heading} from '../Heading/Heading.js';
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
  draft: DraftController;
  collection: schema.Collection;
  docId: string;
}

export function useLocalizationModal(props: LocalizationModalProps) {
  const modals = useModals();
  const modalTheme = useModalTheme();
  return {
    open: () => {
      modals.openContextModal(MODAL_ID, {
        ...modalTheme,
        innerProps: props,
        size: 'clamp(80%, 1024px, 1280px)',
        onClose: () => {
          props.draft.flush();
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
        variant="subtle"
        size="xs"
        compact
        onClick={props.onAllClicked}
        sx={(theme) => ({
          '&:hover': {
            backgroundColor: theme.colors.gray[0],
          },
        })}
      >
        All
      </Button>
      /
      <Button
        variant="subtle"
        size="xs"
        compact
        onClick={props.onNoneClicked}
        sx={(theme) => ({
          '&:hover': {
            backgroundColor: theme.colors.gray[0],
          },
        })}
      >
        None
      </Button>
    </Group>
  );
};

interface TranslationsProps {
  collection: schema.Collection;
  docId: string;
}

LocalizationModal.Translations = (props: TranslationsProps) => {
  const [loading, setLoading] = useState(true);
  const [sourceStrings, setSourceStrings] = useState<string[]>([]);
  const [selectedLocale, setSelectedLocale] = useState('en');
  const [localeTranslations, setLocaleTranslations] = useState<
    Record<string, string>
  >({});
  const [translationsMap, setTranslationsMap] = useState<TranslationsMap>({});
  const gapiClient = useGapiClient();
  const [linkedSheet, setLinkedSheet] = useState<GoogleSheetId | null>(null);
  const exportSheetModal = useExportSheetModal();

  const sourceToTranslationsMap = useMemo(() => {
    const results: {[source: string]: Record<string, string>} = {};
    Object.values(translationsMap).forEach((row: Record<string, string>) => {
      results[row.source] = row;
    });
    return results;
  }, [translationsMap]);

  const locales = window.__ROOT_CTX.rootConfig.i18n?.locales || [];
  const localeOptions = locales.map((locale) => ({
    value: locale,
    label: getLocaleLabel(locale),
  }));

  useEffect(() => {
    setLoading(true);
    Promise.all([
      extractStrings(props.collection, props.docId),
      loadTranslations(),
      cmsGetLinkedGoogleSheetL10n(props.docId),
    ]).then(([sourceStrings, translationsMap, linkedSheet]) => {
      setSourceStrings(sourceStrings);
      setTranslationsMap(translationsMap);
      setLinkedSheet(linkedSheet);
      setLoading(false);
    });
  }, [props.docId]);

  useEffect(() => {
    if (!selectedLocale) {
      setLocaleTranslations({});
      return;
    }
    const localeTranslations: Record<string, string> = {};
    Object.values(translationsMap).forEach(
      (translation: Record<string, string>) => {
        localeTranslations[translation.source] =
          translation[selectedLocale] || '';
      }
    );
    setLocaleTranslations(localeTranslations);
  }, [selectedLocale, translationsMap]);

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
          const importedTranslations = await cmsDocImportCsv(
            props.docId,
            resData
          );
          setTranslationsMap((currentTranslations) => {
            return Object.assign({}, currentTranslations, importedTranslations);
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

    const importedTranslations = await cmsDocImportCsv(props.docId, values);
    setTranslationsMap((currentTranslations) => {
      return Object.assign({}, currentTranslations, importedTranslations);
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

  if (loading) {
    return (
      <div className="LocalizationModal__translations__loading">
        <Loader color="gray" size="xl" />
      </div>
    );
  }

  return (
    <div className="LocalizationModal__translations">
      <div className="LocalizationModal__translations__header">
        <Heading
          className="LocalizationModal__translations__title LocalizationModal__iconTitle"
          size="h2"
        >
          <IconLanguage strokeWidth={1.5} /> <span>Translations</span>
        </Heading>
        <div className="LocalizationModal__translations__header__buttons">
          {gapiClient.enabled && linkedSheet?.spreadsheetId && (
            <Tooltip label="View Google Sheet">
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
      <table className="LocalizationModal__translations__table">
        <tr className="LocalizationModal__translations__table__row LocalizationModal__translations__table__row--header">
          <th className="LocalizationModal__translations__table__header">
            <Heading size="h4" weight="semi-bold">
              SOURCE STRING
            </Heading>
          </th>
          <th className="LocalizationModal__translations__table__header">
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
          </th>
        </tr>
        {sourceStrings.map((source, i) => (
          <tr className="LocalizationModal__translations__table__row" key={i}>
            <td className="LocalizationModal__translations__table__col">
              <Box
                sx={(theme) => ({
                  backgroundColor: theme.colors.gray[0],
                  border: `1px solid ${theme.colors.gray[3]}`,
                  padding: '10px 20px',
                  borderRadius: 4,
                  height: '100%',
                })}
              >
                <Text size="xs" sx={{whiteSpace: 'pre-wrap'}}>
                  {source}
                </Text>
              </Box>
            </td>
            <td className="LocalizationModal__translations__table__col">
              <Box
                sx={(theme) => ({
                  backgroundColor: theme.colors.gray[0],
                  border: `1px solid ${theme.colors.gray[3]}`,
                  padding: '10px 20px',
                  borderRadius: 4,
                  height: '100%',
                })}
              >
                <Text size="xs" sx={{whiteSpace: 'pre-wrap'}}>
                  {localeTranslations[source] || ' '}
                </Text>
              </Box>
            </td>
          </tr>
        ))}
      </table>
    </div>
  );
};

async function extractStrings(collection: schema.Collection, docId: string) {
  const db = window.firebase.db;
  const projectId = window.__ROOT_CTX.rootConfig.projectId;
  const [collectionId, slug] = docId.split('/', 2);
  const docRef = doc(
    db,
    'Projects',
    projectId,
    'Collections',
    collectionId,
    'Drafts',
    slug
  );
  const snapshot = await getDoc(docRef);
  const data = snapshot.data() || {};
  const strings = new Set<string>();
  extractFields(strings, collection.fields, data.fields || {});
  return Array.from(strings);
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

function getLocaleLabel(locale: string) {
  const langNames = new Intl.DisplayNames(['en'], {
    type: 'language',
  });
  const parts = locale.split('_');
  const langCode = parts[0];
  const langName = langNames.of(langCode) || locale;
  return `${langName} (${locale})`;
}
