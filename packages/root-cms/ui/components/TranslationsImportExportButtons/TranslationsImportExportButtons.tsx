import {ActionIcon, Button, Divider, Menu, Tooltip} from '@mantine/core';
import {showNotification} from '@mantine/notifications';
import {
  IconChevronDown,
  IconFileDownload,
  IconFileUpload,
  IconTable,
} from '@tabler/icons-preact';
import {useExportSheetModal} from '@/components/ExportSheetModal/ExportSheetModal.js';
import {logAction} from '@/db/actions.js';
import {
  csvToTranslationsMap,
  Translations,
  translationsIdToDocId,
} from '@/db/translations.js';
import {GapiClient, useGapiClient} from '@/hooks/useGapiClient.js';
import {TranslationsDocController} from '@/hooks/useTranslationsDoc.js';
import {joinClassNames} from '@/utils/classes.js';
import {
  getSpreadsheetUrl,
  GoogleSheetId,
  GSheet,
  GSpreadsheet,
} from '@/utils/gsheets.js';
import {notifyErrors} from '@/utils/notifications.js';
import './TranslationsImportExportButtons.css';

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

export interface TranslationsImportExportButtonsProps {
  className?: string;
  translationsDoc: TranslationsDocController;
}

export function TranslationsImportExportButtons(
  props: TranslationsImportExportButtonsProps
) {
  const translationsDoc = props.translationsDoc;
  const strings = translationsDoc.strings || {};
  const linkedSheet = translationsDoc.linkedSheet;
  const translationsId = translationsDoc.id;
  const docId = translationsIdToDocId(translationsId);

  const i18nConfig = window.__ROOT_CTX.rootConfig.i18n || {};
  const locales = i18nConfig.locales || ['en'];

  const gapiClient = useGapiClient();
  const exportSheetModal = useExportSheetModal();

  function formatCsvData() {
    const nonEnLocales = locales.filter((locale) => locale !== 'en');
    const headers = ['source', 'en', ...nonEnLocales];
    const rows: Array<Record<string, string>> = [];
    Object.values(strings).forEach((item) => {
      if (!item.source) {
        return;
      }
      const row: Record<string, string> = {
        source: item.source,
        en: item.en || item.source,
      };
      nonEnLocales.forEach((locale: string) => {
        row[locale] = item[locale];
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
          const values = (await res.json()).data as Translations[];
          const strings = await csvToTranslationsMap(values);
          translationsDoc.importTranslations(strings);
          await translationsDoc.saveTranslations();

          showNotification({
            title: 'Saved!',
            message: `Imported translations for ${translationsId}.`,
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
        docId: docId,
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
    const values = (await gsheet.getValuesMap()) as Translations[];
    const strings = await csvToTranslationsMap(values);
    translationsDoc.importTranslations(strings);
    await translationsDoc.saveTranslations();

    showNotification({
      title: 'Saved!',
      message: `Imported translations for ${translationsId}.`,
      autoClose: 5000,
    });
  }

  async function unlinkGoogleSheet() {
    await translationsDoc.unlinkSheet();
    showNotification({
      title: 'Unlinked Google Sheet',
      message: `${translationsId} is no longer connected to a Google Sheet.`,
      autoClose: 5000,
    });
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
          translationsId: translationsId,
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
    <div
      className={joinClassNames(
        props.className,
        'TranslationsImportExportButtons'
      )}
    >
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
  );
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
      className="TranslationsImportExportButtons__Menu"
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
            className="TranslationsImportExportButtons__Menu__item"
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
        className="TranslationsImportExportButtons__Menu__item"
        onClick={() => dispatch(MenuAction.IMPORT_CSV)}
      >
        Import .csv
      </Menu.Item>
    </Menu>
  );
}

interface MenuButtonProps {
  gapiClient: GapiClient;
  linkedSheet: GoogleSheetId | null;
  onAction?: (action: MenuAction) => void;
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
      className="TranslationsImportExportButtons__Menu"
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
                className="TranslationsImportExportButtons__Menu__item"
                onClick={() => dispatch(MenuAction.EXPORT_GOOGLE_SHEET_LINKED)}
              >
                Export to Google Sheet
              </Menu.Item>
            </>
          ) : (
            <>
              <Menu.Item
                className="TranslationsImportExportButtons__Menu__item"
                onClick={() =>
                  dispatch(MenuAction.EXPORT_GOOGLE_SHEET_SHOW_OPTIONS)
                }
              >
                Export to Google Sheet
              </Menu.Item>
              {/* <Menu.Item
                className="TranslationsImportExportButtons__Menu__item"
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
        className="TranslationsImportExportButtons__Menu__item"
        onClick={() => dispatch(MenuAction.EXPORT_DOWNLOAD_CSV)}
      >
        Download .csv
      </Menu.Item>
      {hasLinkedSheet && (
        <>
          <Divider />
          <Menu.Label>Danger zone</Menu.Label>
          <Menu.Item
            className="TranslationsImportExportButtons__Menu__item"
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
