import './DocumentPagePreviewBar.css';
import {ActionIcon, Select, Tooltip} from '@mantine/core';
import {
  IconArrowUpRight,
  IconArrowsVertical,
  IconDeviceDesktop,
  IconDeviceIpad,
  IconDeviceMobile,
  IconReload,
  IconWorld,
} from '@tabler/icons-preact';
import {joinClassNames} from '../../utils/classes.js';

export type Device = 'mobile' | 'tablet' | 'desktop' | '';

export interface DocumentPagePreviewBarProps {
  device: Device;
  expandVertically: boolean;
  iframeUrl: string;
  localeOptions: Array<{value: string; label: string}>;
  selectedLocale: string;
  onToggleDevice: (device: Device) => void;
  onToggleExpandVertically: () => void;
  onReloadClick: () => void;
  onOpenNewTab: () => void;
  onLocaleChange: (newValue: string) => void;
}

export function DocumentPagePreviewBar(props: DocumentPagePreviewBarProps) {
  const {
    device,
    expandVertically,
    iframeUrl,
    localeOptions,
    selectedLocale,
    onToggleDevice,
    onToggleExpandVertically,
    onReloadClick,
    onOpenNewTab,
    onLocaleChange,
  } = props;

  return (
    <div className="DocumentPagePreviewBar">
      <div className="DocumentPagePreviewBar__devices">
        <Tooltip label="Mobile">
          <ActionIcon
            className={joinClassNames(
              'DocumentPagePreviewBar__device',
              device === 'mobile' && 'active'
            )}
            onClick={() => onToggleDevice('mobile')}
          >
            <IconDeviceMobile size={16} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Tablet">
          <ActionIcon
            className={joinClassNames(
              'DocumentPagePreviewBar__device',
              device === 'tablet' && 'active'
            )}
            onClick={() => onToggleDevice('tablet')}
          >
            <IconDeviceIpad size={16} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Desktop">
          <ActionIcon
            className={joinClassNames(
              'DocumentPagePreviewBar__device',
              device === 'desktop' && 'active'
            )}
            onClick={() => onToggleDevice('desktop')}
          >
            <IconDeviceDesktop size={16} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Expand">
          <ActionIcon
            className={joinClassNames(
              'DocumentPagePreviewBar__device',
              expandVertically && 'active'
            )}
            aria-pressed={expandVertically}
            disabled={device === ''}
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
