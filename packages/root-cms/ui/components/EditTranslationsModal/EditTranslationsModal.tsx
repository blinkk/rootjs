import {Button, Loader, Textarea} from '@mantine/core';
import {ContextModalProps, useModals} from '@mantine/modals';
import {showNotification, updateNotification} from '@mantine/notifications';
import {ChangeEvent} from 'preact/compat';
import {useEffect, useState} from 'preact/hooks';
import {useModalTheme} from '../../hooks/useModalTheme.js';
import {joinClassNames} from '../../utils/classes.js';
import {CsvTranslation, cmsDocImportTranslations} from '../../utils/doc.js';
import {GoogleSheetId, getSpreadsheetUrl} from '../../utils/gsheets.js';
import {loadTranslations} from '../../utils/l10n.js';
import {notifyErrors} from '../../utils/notifications.js';
import {Heading} from '../Heading/Heading.js';
import './EditTranslationsModal.css';

const MODAL_ID = 'EditTranslationsModal';

export interface EditTranslationsModalProps {
  [key: string]: unknown;
  /** Doc associated with the translations. */
  docId: string;
  /** The strings to show. */
  strings: string[];
  /** A linked Google Sheet associated with the doc, if any. */
  l10nSheet?: GoogleSheetId;
}

export function useEditTranslationsModal() {
  const modals = useModals();
  const modalTheme = useModalTheme();
  return {
    open: (props: EditTranslationsModalProps) => {
      modals.openContextModal(MODAL_ID, {
        ...modalTheme,
        innerProps: props,
        size: '900px',
        title: 'Edit translations',
        overflow: 'inside',
        className: 'EditTranslationsModalWrap',
      });
    },
    close: () => {
      modals.closeModal(MODAL_ID);
    },
  };
}

export function EditTranslationsModal(
  modalProps: ContextModalProps<EditTranslationsModalProps>
) {
  const {innerProps: props, context, id} = modalProps;
  const strings = props.strings || [];
  const i18nConfig = window.__ROOT_CTX.rootConfig.i18n || {};
  const i18nLocales = i18nConfig.locales || ['en'];
  const [translationsMap, setTranslationsMap] = useState<
    Record<string, Record<string, string>>
  >({});
  const [changedKeys, setChangedKeys] = useState<string[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTranslations().then((res) => {
      const translationsMap: Record<string, Record<string, string>> = {};
      Object.values(res).forEach((row) => {
        translationsMap[row.source] = row;
      });
      setTranslationsMap(translationsMap);
      setLoading(false);
    });
  }, [props.docId]);

  async function onSave() {
    setSaving(true);
    await notifyErrors(async () => {
      console.log('EditTranslationsModal.onSave()');
      const notificationId = `edit-translations-${props.docId}`;
      showNotification({
        id: notificationId,
        loading: true,
        title: 'Saving translations',
        message: `Updating for ${props.docId}...`,
        autoClose: false,
        disallowClose: true,
      });
      const changes: CsvTranslation[] = [];
      changedKeys.forEach((changedKey) => {
        const row = translationsMap[changedKey] as CsvTranslation;
        changes.push(row);
      });
      await cmsDocImportTranslations(props.docId, changes);
      updateNotification({
        id: notificationId,
        title: 'Saved translations',
        message: `Updated translations for ${props.docId}!`,
        autoClose: false,
      });
    });
    setSaving(false);
  }

  function onChange(row: Record<string, string>) {
    setTranslationsMap((current) => {
      const newValue = {...current};
      newValue[row.source] = row;
      return newValue;
    });
    setChangedKeys((current) => {
      const newValue = new Set(current);
      newValue.add(row.source);
      return Array.from(newValue);
    });
    setHasChanges(true);
  }

  return (
    <div className="EditTranslationsModal">
      {loading ? (
        <Loader />
      ) : (
        <table className="EditTranslationsModal__table">
          <thead>
            <tr>
              <th>
                <Heading size="h4" weight="semi-bold">
                  SOURCE
                </Heading>
              </th>
              <th>
                <Heading size="h4" weight="semi-bold">
                  TRANSLATIONS
                </Heading>
              </th>
            </tr>
          </thead>
          <tbody>
            {strings.map((source) => (
              <tr>
                <td>
                  <div className="EditTranslationsModal__table__source">
                    {source}
                  </div>
                </td>
                <td>
                  <EditTranslationsModal.StringsEditor
                    source={source}
                    locales={i18nLocales}
                    translations={translationsMap[source] || {}}
                    onChange={onChange}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="EditTranslationsModal__footer">
        {props.l10nSheet && (
          <div className="EditTranslationsModal__footer__gsheet">
            <strong>NOTE:</strong> Translations for this doc are managed via a{' '}
            <a
              href={getSpreadsheetUrl(props.l10nSheet)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Google Sheet
            </a>
          </div>
        )}
        <div className="EditTranslationsModal__footer__buttons">
          <Button
            variant="default"
            size="xs"
            color="dark"
            type="button"
            onClick={() => context.closeModal(id)}
          >
            Cancel
          </Button>
          <Button
            variant="filled"
            size="xs"
            color="dark"
            onClick={() => onSave()}
            disabled={!hasChanges}
            loading={saving}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

EditTranslationsModal.StringsEditor = (props: {
  source: string;
  locales: string[];
  translations: Record<string, string>;
  onChange: (row: Record<string, string>) => void;
}) => {
  const locales = props.locales;
  const [translations, setTranslations] = useState<Record<string, string>>(
    props.translations || {}
  );
  const [hasChanges, setHasChanges] = useState(false);

  function updateTranslation(locale: string, value: string) {
    setHasChanges(true);
    setTranslations((current) => {
      const newTranslations: Record<string, string> = {
        ...current,
        source: props.source,
      };
      newTranslations[locale] = value;
      return newTranslations;
    });
  }

  useEffect(() => {
    if (hasChanges) {
      props.onChange(translations);
    }
  }, [hasChanges, translations]);

  return (
    <div className="EditTranslationsModal__StringsEditor">
      {locales.map((locale) => (
        <div className="EditTranslationsModal__StringsEditor__row">
          <div className="EditTranslationsModal__StringsEditor__row__locale">
            {locale}
          </div>
          <div
            className={joinClassNames(
              'EditTranslationsModal__StringsEditor__row__translation',
              translations[locale] ? 'hasValue' : 'empty'
            )}
          >
            <Textarea
              size="xs"
              radius={0}
              autosize
              minRows={1}
              maxRows={10}
              value={translations[locale]}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
                updateTranslation(locale, e.currentTarget.value);
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

EditTranslationsModal.id = MODAL_ID;
