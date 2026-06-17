import './DocumentPagePreviewBar.css';
import {ActionIcon, Select, Tooltip} from '@mantine/core';
import {
  IconArrowUpRight,
  IconArrowsVertical,
  IconColumns2,
  IconDeviceDesktop,
  IconDeviceIpad,
  IconDeviceMobile,
  IconReload,
  IconWorld,
} from '@tabler/icons-preact';
import {joinClassNames} from '../../utils/classes.js';

/** A selectable preview viewport. */
export type DeviceType = 'mobile' | 'tablet' | 'desktop';

/**
 * A preview viewport, where the empty string represents the full-width preview.
 * Retained for backwards compatibility; new code should use `DeviceType` and an
 * empty `devices` array to represent the full-width preview.
 */
export type Device = DeviceType | '';

export interface DocumentPagePreviewBarProps {
  devices: DeviceType[];
  multiSelect: boolean;
  expandVertically: boolean;
  iframeUrl: string;
  localeOptions: Array<{value: string; label: string}>;
  selectedLocale: string;
  onToggleDevice: (device: DeviceType) => void;
  onToggleMultiSelect: () => void;
  onToggleExpandVertically: () => void;
  onReloadClick: () => void;
  onOpenNewTab: () => void;
  onLocaleChange: (newValue: string) => void;
}

export function DocumentPagePreviewBar(props: DocumentPagePreviewBarProps) {
  const {
    devices,
    multiSelect,
    expandVertically,
    iframeUrl,
    localeOptions,
    selectedLocale,
    onToggleDevice,
    onToggleMultiSelect,
    onToggleExpandVertically,
    onReloadClick,
    onOpenNewTab,
    onLocaleChange,
  } = props;

  const hasDevice = devices.length > 0;

  return (
    <div className="DocumentPagePreviewBar">
      <div className="DocumentPagePreviewBar__devices">
        <Tooltip label="Mobile">
          <ActionIcon
            className={joinClassNames(
              'DocumentPagePreviewBar__device',
              devices.includes('mobile') && 'active'
            )}
            aria-pressed={devices.includes('mobile')}
            onClick={() => onToggleDevice('mobile')}
          >
            <IconDeviceMobile size={16} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Tablet">
          <ActionIcon
            className={joinClassNames(
              'DocumentPagePreviewBar__device',
              devices.includes('tablet') && 'active'
            )}
            aria-pressed={devices.includes('tablet')}
            onClick={() => onToggleDevice('tablet')}
          >
            <IconDeviceIpad size={16} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Desktop">
          <ActionIcon
            className={joinClassNames(
              'DocumentPagePreviewBar__device',
              devices.includes('desktop') && 'active'
            )}
            aria-pressed={devices.includes('desktop')}
            onClick={() => onToggleDevice('desktop')}
          >
            <IconDeviceDesktop size={16} />
          </ActionIcon>
        </Tooltip>
        <div className="DocumentPagePreviewBar__divider" />
        <Tooltip label="Compare viewports">
          <ActionIcon
            className={joinClassNames(
              'DocumentPagePreviewBar__device',
              multiSelect && 'active'
            )}
            role="checkbox"
            aria-checked={multiSelect}
            onClick={onToggleMultiSelect}
          >
            <IconColumns2 size={16} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Expand">
          <ActionIcon
            className={joinClassNames(
              'DocumentPagePreviewBar__device',
              expandVertically && 'active'
            )}
            aria-pressed={expandVertically}
            disabled={!hasDevice}
            onClick={onToggleExpandVertically}
          >
            <IconArrowsVertical size={16} />
          </ActionIcon>
        </Tooltip>
      </div>
      <div className="DocumentPagePreviewBar__navbar">
        <div className="DocumentPagePreviewBar__navbar__url">{iframeUrl}</div>
      </div>
      <div className="DocumentPagePreviewBar__locales">
        <Select
          data={localeOptions}
          placeholder="Locale"
          radius="xl"
          size="xs"
          required
          icon={<IconWorld size={16} strokeWidth={1.5} />}
          value={selectedLocale}
          onChange={(newValue: string) => {
            onLocaleChange(newValue);
          }}
        />
      </div>
      <div className="DocumentPagePreviewBar__buttons">
        <Tooltip label="Reload">
          <ActionIcon
            className="DocumentPagePreviewBar__button DocumentPagePreviewBar__button--reload"
            onClick={onReloadClick}
          >
            <IconReload size={16} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Open new tab">
          <ActionIcon
            className="DocumentPagePreviewBar__button DocumentPagePreviewBar__button--openNewTab"
            onClick={onOpenNewTab}
          >
            <IconArrowUpRight size={16} />
          </ActionIcon>
        </Tooltip>
      </div>
    </div>
  );
}
