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
import type {ComponentChildren} from 'preact';
import {IconButton} from '../../../../primitives/IconButton/IconButton.js';
import {Select} from '../../../../primitives/Select/Select.js';

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

/** Toggled toolbar buttons keep Mantine's light grey "active" fill. */
const TOGGLE_CLASSES =
  'DocumentPagePreviewBar__device aria-pressed:bg-surface-hover aria-checked:bg-surface-hover';

const DEVICES: Array<{
  device: DeviceType;
  label: string;
  icon: ComponentChildren;
}> = [
  {device: 'mobile', label: 'Mobile', icon: <IconDeviceMobile />},
  {device: 'tablet', label: 'Tablet', icon: <IconDeviceIpad />},
  {device: 'desktop', label: 'Desktop', icon: <IconDeviceDesktop />},
];

/**
 * The toolbar above the doc page's preview: device sizes, compare and
 * expand toggles, the previewed URL, the locale, reload and open in a new
 * tab.
 */
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
    <div className="DocumentPagePreviewBar flex h-9 shrink-0 items-center gap-2 border-0 border-b border-solid border-border px-3">
      <div className="DocumentPagePreviewBar__devices flex shrink-0 items-center gap-0.5">
        {DEVICES.map((item) => (
          <IconButton
            key={item.device}
            className={TOGGLE_CLASSES}
            label={item.label}
            pressed={devices.includes(item.device)}
            onClick={() => onToggleDevice(item.device)}
          >
            {item.icon}
          </IconButton>
        ))}
        <div className="DocumentPagePreviewBar__divider mx-1 my-1.5 w-px self-stretch bg-border" />
        <IconButton
          className={TOGGLE_CLASSES}
          label="Compare viewports"
          role="checkbox"
          aria-checked={multiSelect}
          onClick={onToggleMultiSelect}
        >
          <IconColumns2 />
        </IconButton>
        <IconButton
          className={TOGGLE_CLASSES}
          label="Expand"
          pressed={expandVertically}
          disabled={!hasDevice}
          onClick={onToggleExpandVertically}
        >
          <IconArrowsVertical />
        </IconButton>
      </div>
      <div className="DocumentPagePreviewBar__navbar flex min-w-0 flex-1 items-center justify-between overflow-hidden rounded-full border border-solid border-border px-6 py-0.5 text-sm font-medium">
        <div className="DocumentPagePreviewBar__navbar__url truncate">
          {iframeUrl}
        </div>
      </div>
      <Select
        className="DocumentPagePreviewBar__locales max-w-44 shrink-0"
        inputClassName="rounded-full border-border"
        aria-label="Locale"
        data={localeOptions}
        placeholder="Locale"
        size="xs"
        leftSection={<IconWorld strokeWidth={1.5} />}
        value={selectedLocale}
        onValueChange={(newValue) => onLocaleChange(newValue ?? '')}
      />
      <div className="DocumentPagePreviewBar__buttons flex shrink-0 items-center gap-0.5">
        <IconButton
          className="DocumentPagePreviewBar__button DocumentPagePreviewBar__button--reload"
          label="Reload"
          onClick={onReloadClick}
        >
          <IconReload />
        </IconButton>
        <IconButton
          className="DocumentPagePreviewBar__button DocumentPagePreviewBar__button--openNewTab"
          label="Open new tab"
          onClick={onOpenNewTab}
        >
          <IconArrowUpRight />
        </IconButton>
      </div>
    </div>
  );
}
