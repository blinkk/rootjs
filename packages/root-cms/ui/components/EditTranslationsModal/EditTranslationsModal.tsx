import {Button, Textarea} from '@mantine/core';
import {ContextModalProps, useModals} from '@mantine/modals';
import {ChangeEvent} from 'preact/compat';
import {useEffect, useState} from 'preact/hooks';
import {useModalTheme} from '../../hooks/useModalTheme.js';
import {joinClassNames} from '../../utils/classes.js';
import {Heading} from '../Heading/Heading.js';
import './EditTranslationsModal.css';

const MODAL_ID = 'EditTranslationsModal';

export interface EditTranslationsModalProps {
  [key: string]: unknown;
  strings: string[];
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
  const [hasChanges, setHasChanges] = useState(false);

  function onSave() {
    console.log('EditTranslationsModal.onSave()');
  }

  function onChange(row: Record<string, string>) {
    setTranslationsMap((current) => {
      const newValue = {...current};
      newValue[row.source] = row;
      return newValue;
    });
    setHasChanges(true);
  }

  return (
    <div className="EditTranslationsModal">
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

      <div className="EditTranslationsModal__buttons">
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
          onClick={onSave}
          disabled={!hasChanges}
        >
          Save
        </Button>
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
                updateTranslation(locale, String(e.currentTarget.value).trim());
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

EditTranslationsModal.id = MODAL_ID;
