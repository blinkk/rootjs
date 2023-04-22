import {
  Button,
  Checkbox,
  Group,
  Modal,
  Stack,
  Text,
  useMantineTheme,
} from '@mantine/core';
import {useState} from 'preact/hooks';
import {Heading} from '../Heading/Heading.js';
import './LocalizationModal.css';

interface LocalizationModalProps {
  docId: string;
  opened?: boolean;
  onClose?: () => void;
}

export function LocalizationModal(props: LocalizationModalProps) {
  const theme = useMantineTheme();

  function onClose() {
    if (props.onClose) {
      props.onClose();
    }
  }

  return (
    <Modal
      className="LocalizationModal"
      opened={props.opened || false}
      onClose={() => onClose()}
      size="min(80%, 1280px)"
      overlayColor={
        theme.colorScheme === 'dark'
          ? theme.colors.dark[9]
          : theme.colors.gray[2]
      }
      overlayOpacity={0.55}
      overlayBlur={3}
    >
      <div className="LocalizationModal__layout">
        <div className="LocalizationModal__locales">
          <LocalizationModal.ConfigLocales />
        </div>
        <div className="LocalizationModal__translations">
          <Heading size="h2">Translations</Heading>
        </div>
      </div>
    </Modal>
  );
}

LocalizationModal.ConfigLocales = (props: any) => {
  const [enabledLocales, setEnabledLocales] = useState(
    props.enabledLocales || ['en']
  );
  const i18nConfig = window.__ROOT_CTX.rootConfig.i18n || {};
  const podLocales = i18nConfig.locales || ['en'];
  const localeGroups: LocaleGroupsConfig = i18nConfig.groups || {
    default: {
      label: '',
      locales: podLocales,
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
    setEnabledLocales(newLocales);
  }

  return (
    <Stack spacing={30}>
      <Group>
        <Heading className="LocalizationModal__locales__title" size="h2">
          Locales
        </Heading>
        <LocalizationModal.AllNoneButtons
          onAllClicked={() => setEnabledLocales(podLocales)}
          onNoneClicked={() => setEnabledLocales([])}
        />
      </Group>
      <Stack spacing={40}>
        {Object.keys(localeGroups).map((groupId: string) => {
          const group = localeGroups[groupId];
          const enabledLocales = enabledLocalesFor(groupId);
          return (
            <LocalizationModal.LocaleGroup
              group={group}
              enabledLocales={enabledLocales}
              onChange={(locales) => setGroupEnabledLocales(groupId, locales)}
            />
          );
        })}
      </Stack>
      {/* <Group position="right" sx={{marginTop: 40}}>
        <Button
          variant="light"
          color="gray"
          size="xs"
          onClick={() => props.onCancel && props.onCancel()}
        >
          Cancel
        </Button>
        <Button
          size="xs"
          onClick={() => props.onSave && props.onSave(enabledLocales)}
        >
          Save
        </Button>
      </Group> */}
    </Stack>
  );
};

interface LocaleGroup {
  label?: string;
  locales: string[];
}

type LocaleGroupsConfig = Record<string, LocaleGroup>;

interface LocaleGroupProps {
  group: LocaleGroup;
  enabledLocales: string[];
  onChange?: (locales: string[]) => void;
}

LocalizationModal.LocaleGroup = (props: LocaleGroupProps) => {
  const enabledLocales = props.enabledLocales || [];
  const groupLocales = props.group.locales || [];
  const langNames = new Intl.DisplayNames(['en'], {
    type: 'language',
  });
  function getLabel(locale: string) {
    const parts = locale.split('_');
    const langCode = parts[0];
    const langName = langNames.of(langCode) || locale;
    return `${langName} (${locale})`;
  }

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
        {groupLocales.map((locale) => (
          <Checkbox
            value={locale}
            checked={enabledLocales.includes(locale) || locale === 'en'}
            disabled={locale === 'en'}
            label={getLabel(locale)}
            onChange={() => toggleLocale(locale)}
            size="xs"
          />
        ))}
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
