import {
  Box,
  Button,
  Checkbox,
  Group,
  Loader,
  Select,
  Stack,
  Text,
} from '@mantine/core';
import {ContextModalProps, useModals} from '@mantine/modals';
import {IconLanguage, IconMapPin} from '@tabler/icons-preact';
import {useEffect, useState} from 'preact/hooks';
import {Heading} from '@/components/Heading/Heading.js';
import {TranslationsImportExportButtons} from '@/components/TranslationsImportExportButtons/TranslationsImportExportButtons.js';
import {DraftController} from '@/hooks/useDraft.js';
import {useModalTheme} from '@/hooks/useModalTheme.js';
import {useTranslationsDoc} from '@/hooks/useTranslationsDoc.js';
import * as schema from '@/../core/schema.js';

import './LocalizationModal.css';

const MODAL_ID = 'LocalizationModal';

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

LocalizationModal.Translations = (props: LocalizationModalProps) => {
  const [selectedLocale, setSelectedLocale] = useState(() => {
    // Initialize with the first non-EN locale.
    if (props.draft) {
      const locales = props.draft.getLocales();
      if (locales.length === 1) {
        return locales[0];
      }
      if (locales.length > 1) {
        for (const l of locales) {
          if (l !== 'en') {
            return l;
          }
        }
      }
    }
    return 'en';
  });
  const [localeTranslations, setLocaleTranslations] = useState<
    Record<string, string>
  >({});
  const locales = window.__ROOT_CTX.rootConfig.i18n?.locales || [];
  const localeOptions = locales.map((locale) => ({
    value: locale,
    label: getLocaleLabel(locale),
  }));

  const translationsDoc = useTranslationsDoc(props.docId);
  const loading = translationsDoc.loading;

  const translationsMap = translationsDoc?.strings || {};
  const sourceStrings = Object.values(translationsMap)
    .map((item) => item.source)
    .filter((item) => !!item);

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
        <div className="LocalizationModal__translations__titleWrap">
          <Heading
            className="LocalizationModal__translations__title LocalizationModal__iconTitle"
            size="h2"
          >
            <IconLanguage strokeWidth={1.5} /> <span>Translations</span>
          </Heading>
          <Button
            component="a"
            href={`/cms/translations/${props.docId}`}
            target="_blank"
            variant="default"
            size="xs"
          >
            Open Translations Editor
          </Button>
        </div>
        <TranslationsImportExportButtons
          className="LocalizationModal__translations__header__buttons"
          translationsDoc={translationsDoc}
        />
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
