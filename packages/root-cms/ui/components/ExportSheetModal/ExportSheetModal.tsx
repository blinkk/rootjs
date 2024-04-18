import {Button, Select, TextInput} from '@mantine/core';
import {ContextModalProps, useModals} from '@mantine/modals';
import {showNotification, updateNotification} from '@mantine/notifications';
import {ChangeEvent, forwardRef} from 'preact/compat';
import {useState} from 'preact/hooks';
import {useGapiClient} from '../../hooks/useGapiClient.js';
import {useModalTheme} from '../../hooks/useModalTheme.js';
import {cmsLinkGoogleSheetL10n} from '../../utils/doc.js';
import {
  GSheet,
  GSpreadsheet,
  getSpreadsheetUrl,
  parseSpreadsheetUrl,
} from '../../utils/gsheets.js';
import {notifyErrors} from '../../utils/notifications.js';
import {Text} from '../Text/Text.js';
import './ExportSheetModal.css';

const MODAL_ID = 'ExportSheetModal';

export type Action = 'new-sheet' | 'add-tab' | 'link-sheet';

export interface ExportSheetModalProps {
  [key: string]: unknown;
  docId: string;
  csvData: {headers: string[]; rows: Record<string, string>[]};
  locales: string[];
}

export function useExportSheetModal() {
  const modals = useModals();
  const modalTheme = useModalTheme();
  return {
    open: (props: ExportSheetModalProps) => {
      modals.openContextModal(MODAL_ID, {
        ...modalTheme,
        title: 'Export to Google Sheet',
        innerProps: props,
        size: '650px',
      });
    },
  };
}

export function ExportSheetModal(
  modalProps: ContextModalProps<ExportSheetModalProps>
) {
  const {innerProps: props, context, id} = modalProps;
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<Action>('new-sheet');
  const [sheetUrl, setSheetUrl] = useState('');
  const [done, setDone] = useState(false);
  const gapiClient = useGapiClient();

  const selectItems = [
    {
      value: 'new-sheet',
      label: 'Create Google Sheet',
      help: 'Creates a new Google Sheet and exports strings to the sheet.',
    },
    {
      value: 'add-tab',
      label: 'Add tab in Google Sheet',
      help: 'Adds a new tab in an existing Google Sheet and exports strings to the sheet.',
    },
    {
      value: 'link-sheet',
      label: 'Link Google Sheet',
      help: 'Links an existing Google Sheet without exporting strings.',
    },
  ];

  let buttonDisabled = false;
  if (action === 'add-tab' || action === 'link-sheet') {
    buttonDisabled = true;
    if (sheetUrl) {
      const gsheetId = parseSpreadsheetUrl(sheetUrl);
      if (gsheetId?.spreadsheetId) {
        buttonDisabled = false;
      }
    }
  }

  async function exportStringsToSheet(
    gsheet: GSheet,
    options?: {isNew?: boolean}
  ) {
    const isNew = options?.isNew || false;
    const {headers, rows} = props.csvData;
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
        preserveColumns: props.locales,
      });
    }
  }

  async function createGoogleSheet() {
    if (!gapiClient.isLoggedIn()) {
      await gapiClient.login();
    }

    // Create Google Sheet.
    const rootConfig = window.__ROOT_CTX.rootConfig;
    const project =
      rootConfig.projectName || rootConfig.projectId || 'Root CMS';
    let gspreadsheet: GSpreadsheet;
    let gsheet: GSheet;
    const notificationId = 'create-google-sheet';
    try {
      showNotification({
        id: notificationId,
        loading: true,
        title: 'Creating Google Sheet...',
        message: 'Creating Google Sheet for localization.',
        autoClose: false,
        disallowClose: true,
      });
      gspreadsheet = await GSpreadsheet.create({
        title: `${project} Localization`,
      });
      gsheet = (await gspreadsheet.getSheet(0)) as GSheet;
      if (!gsheet) {
        throw new Error('could not find sheet gid=0');
      }
      // Update tab name to the doc id.
      gsheet.setTitle(props.docId);
    } catch (err) {
      console.error(err);
      let msg = err;
      if (typeof err === 'object' && err.body) {
        msg = String(err.body);
      }
      updateNotification({
        id: notificationId,
        title: 'Failed to create Google Sheet',
        message: String(msg),
        color: 'red',
        autoClose: false,
      });
      return;
    }

    // Link Google Sheet to CMS doc.
    try {
      updateNotification({
        id: notificationId,
        loading: true,
        title: 'Created Google Sheet!',
        message: `Linking sheet to ${props.docId}...`,
        autoClose: false,
        disallowClose: true,
      });
      const linkedSheet = {
        spreadsheetId: gspreadsheet.spreadsheetId,
        gid: 0,
      };
      await cmsLinkGoogleSheetL10n(props.docId, linkedSheet);
      setSheetUrl(gsheet.getUrl());
    } catch (err) {
      console.error(err);
      updateNotification({
        id: notificationId,
        title: 'Failed to link Google Sheet',
        message: String(err),
        color: 'red',
        autoClose: false,
      });
      return;
    }

    // Export strings from the doc to the sheet.
    try {
      updateNotification({
        id: notificationId,
        loading: true,
        title: 'Linked Google Sheet!',
        message: 'Exporting strings to sheet...',
        autoClose: false,
        disallowClose: true,
      });
      await exportStringsToSheet(gsheet, {isNew: true});
    } catch (err) {
      console.error(err);
      let msg = err;
      if (typeof err === 'object' && err.body) {
        msg = String(err.body);
      }
      updateNotification({
        id: notificationId,
        title: 'Failed to export strings to Google Sheet',
        message: msg,
        color: 'red',
        autoClose: false,
      });
      return;
    }

    setDone(true);
    updateNotification({
      id: notificationId,
      title: 'Done! Exported strings to Google Sheet.',
      message: gspreadsheet.getUrl(),
      autoClose: false,
    });
  }

  async function addTabInGoogleSheet() {
    if (!gapiClient.isLoggedIn()) {
      await gapiClient.login();
    }

    const gsheetId = parseSpreadsheetUrl(sheetUrl);
    if (!gsheetId?.spreadsheetId) {
      throw new Error('failed to parse spreadsheet id');
    }

    // Create tab in spreadsheet.
    const gspreadsheet = new GSpreadsheet(gsheetId.spreadsheetId);
    let gsheet: GSheet;
    const notificationId = 'add-tab-google-sheet';
    try {
      showNotification({
        id: notificationId,
        loading: true,
        title: 'Creating tab in Google Sheet...',
        message: 'Adding tab in existing Google Sheet',
        autoClose: false,
        disallowClose: true,
      });
      gsheet = await gspreadsheet.createSheet({title: props.docId});
    } catch (err) {
      console.error(err);
      let msg = err;
      if (typeof err === 'object' && err.body) {
        msg = String(err.body);
      }
      updateNotification({
        id: notificationId,
        title: 'Failed to create Google Sheet',
        message: String(msg),
        color: 'red',
        autoClose: false,
      });
      return;
    }

    // Link Google Sheet to CMS doc.
    try {
      updateNotification({
        id: notificationId,
        loading: true,
        title: 'Created Google Sheet!',
        message: `Linking sheet to ${props.docId}...`,
        autoClose: false,
        disallowClose: true,
      });
      const linkedSheet = {
        spreadsheetId: gspreadsheet.spreadsheetId,
        gid: gsheet.gid,
      };
      await cmsLinkGoogleSheetL10n(props.docId, linkedSheet);
    } catch (err) {
      console.error(err);
      updateNotification({
        id: notificationId,
        title: 'Failed to link Google Sheet',
        message: String(err),
        color: 'red',
        autoClose: false,
      });
      return;
    }

    // Export strings from the doc to the sheet.
    try {
      updateNotification({
        id: notificationId,
        loading: true,
        title: 'Linked Google Sheet!',
        message: 'Exporting strings to sheet...',
        autoClose: false,
        disallowClose: true,
      });
      await exportStringsToSheet(gsheet, {isNew: true});
    } catch (err) {
      console.error(err);
      let msg = err;
      if (typeof err === 'object' && err.body) {
        msg = String(err.body);
      }
      updateNotification({
        id: notificationId,
        title: 'Failed to export strings to Google Sheet',
        message: msg,
        color: 'red',
        autoClose: false,
      });
      return;
    }

    setDone(true);
    updateNotification({
      id: notificationId,
      title: 'Done! Exported strings to Google Sheet.',
      message: gsheet.getUrl(),
      autoClose: false,
    });
  }

  async function linkGoogleSheet() {
    const notificationId = 'link-google-sheet';
    const gsheetId = parseSpreadsheetUrl(sheetUrl);
    if (!gsheetId?.spreadsheetId) {
      throw new Error('failed to parse spreadsheet id');
    }
    // Link Google Sheet to CMS doc.
    try {
      showNotification({
        id: notificationId,
        loading: true,
        title: 'Link Google Sheet',
        message: `Linking sheet to ${props.docId}...`,
        autoClose: false,
        disallowClose: true,
      });
      await cmsLinkGoogleSheetL10n(props.docId, gsheetId);
    } catch (err) {
      console.error(err);
      updateNotification({
        id: notificationId,
        title: 'Failed to link Google Sheet',
        message: String(err),
        color: 'red',
        autoClose: false,
      });
      return;
    }

    setDone(true);
    updateNotification({
      id: notificationId,
      title: `Done! Linked ${props.docId} to Google Sheet.`,
      message: getSpreadsheetUrl(gsheetId),
      autoClose: false,
    });
  }

  async function onSubmit() {
    console.log(action);
    setLoading(true);
    if (action === 'new-sheet') {
      await notifyErrors(createGoogleSheet);
    } else if (action === 'add-tab') {
      await notifyErrors(addTabInGoogleSheet);
    } else if (action === 'link-sheet') {
      // TODO
      await notifyErrors(linkGoogleSheet);
    }
    setLoading(false);
  }

  return (
    <div className="ExportSheetModal">
      <div className="ExportSheetModal__content">
        <div className="ExportSheetModal__content__body">
          Export strings to Google Sheet or link an existing Google Sheet for
          managing translations.
        </div>
        <form className="ExportSheetModal__form">
          <div className="ExportSheetModal__form__section">
            <div className="ExportSheetModal__form__description">
              Export options:
            </div>
            <Select
              itemComponent={ExportSheetModal.SelectItem}
              data={selectItems}
              onChange={(e) => {
                setAction(e);
                if (e === 'new-sheet') {
                  setSheetUrl('');
                }
              }}
              value={action}
            />
          </div>
          <div className="ExportSheetModal__form__section">
            <div className="ExportSheetModal__form__description">
              Google Sheet URL:
            </div>
            <TextInput
              disabled={action === 'new-sheet'}
              value={sheetUrl}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setSheetUrl(e.currentTarget.value)
              }
            />
          </div>
          <div className="ExportSheetModal__form__buttons">
            {done ? (
              <Button
                variant="filled"
                onClick={() => context.closeModal(id)}
                type="button"
                size="xs"
                color="primary"
              >
                Done
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => context.closeModal(id)}
                  type="button"
                  size="xs"
                  color="dark"
                >
                  Cancel
                </Button>
                <Button
                  variant="filled"
                  size="xs"
                  color="primary"
                  loading={loading}
                  disabled={buttonDisabled}
                  onClick={() => onSubmit()}
                >
                  {action === 'link-sheet'
                    ? 'Link Google Sheet'
                    : 'Export to Google Sheet'}
                </Button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

ExportSheetModal.SelectItem = forwardRef(
  (props: {label: string; help: string; ref: any}) => {
    const {label, help, ...selectProps} = props;
    return (
      <div className="ExportSheetModal__SelectItem" {...selectProps}>
        <Text className="ExportSheetModal__SelectItem__label" size="body">
          {label}
        </Text>
        <Text className="ExportSheetModal__SelectItem__help" size="body-sm">
          {help}
        </Text>
      </div>
    );
  }
);

ExportSheetModal.id = MODAL_ID;
