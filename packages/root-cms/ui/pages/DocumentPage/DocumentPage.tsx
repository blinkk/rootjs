import {ActionIcon, Button, Select, Tooltip} from '@mantine/core';
import {useHotkeys} from '@mantine/hooks';
import {
  IconArrowLeft,
  IconArrowUpRight,
  IconDeviceDesktop,
  IconDeviceFloppy,
  IconDeviceIpad,
  IconDeviceMobile,
  IconGlobe,
  IconReload,
  IconWorld,
} from '@tabler/icons-preact';
import {useEffect, useRef, useState} from 'preact/hooks';

import {DocEditor} from '../../components/DocEditor/DocEditor.js';
import {SplitPanel} from '../../components/SplitPanel/SplitPanel.js';
import {UseDraftHook, useDraft} from '../../hooks/useDraft.js';
import {Layout} from '../../layout/Layout.js';
import {joinClassNames} from '../../utils/classes.js';
import {getDocPreviewPath, getDocServingPath} from '../../utils/doc-urls.js';
import './DocumentPage.css';

interface DocumentPageProps {
  collection: string;
  slug: string;
}

export function DocumentPage(props: DocumentPageProps) {
  const collectionId = props.collection;
  const slug = props.slug;
  const docId = `${collectionId}/${slug}`;
  const collection = window.__ROOT_CTX.collections[collectionId];
  const draft = useDraft(docId);

  if (!collection) {
    return <div>Could not find collection.</div>;
  }

  function saveDraft() {
    draft.controller.flush();
  }

  useHotkeys([['mod+S', () => saveDraft()]]);

  return (
    <Layout>
      <SplitPanel className="DocumentPage" localStorageId="DocumentPage">
        <SplitPanel.Item className="DocumentPage__side">
          <div className="DocumentPage__side__header">
            <div className="DocumentPage__side__header__nav">
              <a href={`/cms/content/${collectionId}`}>
                <ActionIcon className="DocumentPage__side__header__back">
                  <IconArrowLeft size={16} />
                </ActionIcon>
              </a>
              <div className="DocumentPage__side__header__docId">{docId}</div>
            </div>
            <div className="DocumentPage__side__header__buttons">
              <Button
                variant="filled"
                color="dark"
                size="xs"
                compact
                leftIcon={<IconDeviceFloppy size={14} />}
                onClick={() => saveDraft()}
              >
                Save
              </Button>
            </div>
          </div>
          <div className="DocumentPage__side__editor">
            <DocEditor collection={collection} docId={docId} draft={draft} />
          </div>
        </SplitPanel.Item>
        <SplitPanel.Item className="DocumentPage__main" fluid>
          <DocumentPage.Preview docId={docId} draft={draft} />
        </SplitPanel.Item>
      </SplitPanel>
    </Layout>
  );
}

interface PreviewProps {
  docId: string;
  draft: UseDraftHook;
}

type Device = 'mobile' | 'tablet' | 'desktop' | '';

const DeviceResolution = {
  mobile: [360, 800],
  tablet: [768, 1024],
  desktop: [1440, 800],
};

function getLocaleLabel(locale: string) {
  const langNames = new Intl.DisplayNames(['en'], {
    type: 'language',
  });
  const parts = locale.split('_');
  const langCode = parts[0];
  const langName = langNames.of(langCode) || locale;
  return `${langName} (${locale})`;
}

function getLocalizedUrl(urlPath: string, locale: string) {
  const urlFormat =
    window.__ROOT_CTX.rootConfig.i18n?.urlFormat || '/{locale}/{path}';
  return urlFormat
    .replaceAll('{locale}', locale)
    .replaceAll('/{path}', urlPath);
}

DocumentPage.Preview = (props: PreviewProps) => {
  const domain = window.__ROOT_CTX.rootConfig.domain || 'https://example.com';
  const servingPath = getDocServingPath(props.docId);
  const previewPath = `${getDocPreviewPath(props.docId)}?preview=true`;
  const servingUrl = `${domain}${servingPath}`;
  const [iframeUrl, setIframeUrl] = useState(servingUrl);
  const [device, setDevice] = useState<Device>('');
  const [iframeStyle, setIframeStyle] = useState({
    '--iframe-width': '100%',
    '--iframe-height': '100%',
    '--iframe-scale': '1',
  });
  const [selectedLocale, setSelectedLocale] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const locales = props.draft.controller.getLocales();

  const localeOptions = [
    {value: '', label: 'Select locale'},
    ...locales.map((locale) => ({
      value: locale,
      label: getLocaleLabel(locale),
    })),
  ];

  function reloadIframe() {
    const iframe = iframeRef.current!;
    iframe.src = 'about:blank';
    window.setTimeout(() => {
      if (iframe.src !== previewPath) {
        iframe.src = previewPath;
      } else {
        iframe.contentWindow!.location.reload();
      }
    }, 20);
  }

  useEffect(() => {
    const iframe = iframeRef.current!;
    function onIframeLoad() {
      const iframeWindow = iframe.contentWindow;
      if (!iframeWindow) {
        return;
      }
      if (!iframeWindow.location.href.startsWith('about:blank')) {
        const currentPath = iframeWindow.location.pathname;
        setIframeUrl(`${domain}${currentPath}`);
      }
    }
    iframe.addEventListener('load', onIframeLoad);

    const removeOnFlush = props.draft.controller.onFlush(() => {
      reloadIframe();
    });

    return () => {
      removeOnFlush();
      iframe.removeEventListener('load', onIframeLoad);
    };
  }, []);

  useEffect(() => {
    console.log('locale changed', selectedLocale);
    const localizedUrl = selectedLocale
      ? getLocalizedUrl(previewPath, selectedLocale)
      : previewPath;
    const iframe = iframeRef.current!;
    iframe.src = localizedUrl;
  }, [selectedLocale]);

  function toggleDevice(device: Device) {
    setDevice((current) => {
      if (current === device) {
        return '';
      }
      return device;
    });
  }

  function onReloadClick() {
    // Save any unsaved changes and then reload the iframe.
    props.draft.controller.flush().then(() => reloadIframe());
  }

  function openNewTab() {
    const tab = window.open(previewPath, '_blank');
    if (tab) {
      tab.focus();
    }
  }

  useEffect(() => {
    if (device === '') {
      setIframeStyle({
        '--iframe-width': '100%',
        '--iframe-height': '100%',
        '--iframe-scale': '1',
      });
      return;
    }

    const iframe = iframeRef.current!;
    const container = iframe.parentElement!.parentElement as HTMLElement;
    const rect = container.getBoundingClientRect();
    const [width, height] = DeviceResolution[device];
    const padding = 20;
    let scale = 1;
    if (
      width > rect.width - 2 * padding ||
      height > rect.height - 2 * padding
    ) {
      scale = Math.min(
        (rect.width - 2 * padding) / width,
        (rect.height - 2 * padding) / height
      );
    }
    setIframeStyle({
      '--iframe-width': `${width}px`,
      '--iframe-height': `${height}px`,
      '--iframe-scale': String(scale),
    });
  }, [device]);

  return (
    <div className="DocumentPage__main__preview">
      <div className="DocumentPage__main__previewBar">
        <div className="DocumentPage__main__previewBar__devices">
          <Tooltip label="Mobile">
            <ActionIcon
              className={joinClassNames(
                'DocumentPage__main__previewBar__device',
                device === 'mobile' && 'active'
              )}
              onClick={() => toggleDevice('mobile')}
            >
              <IconDeviceMobile size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Tablet">
            <ActionIcon
              className={joinClassNames(
                'DocumentPage__main__previewBar__device',
                device === 'tablet' && 'active'
              )}
              onClick={() => toggleDevice('tablet')}
            >
              <IconDeviceIpad size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Desktop">
            <ActionIcon
              className={joinClassNames(
                'DocumentPage__main__previewBar__device',
                device === 'desktop' && 'active'
              )}
              onClick={() => toggleDevice('desktop')}
            >
              <IconDeviceDesktop size={16} />
            </ActionIcon>
          </Tooltip>
        </div>
        <div className="DocumentPage__main__previewBar__navbar">
          <div className="DocumentPage__main__previewBar__navbar__url">
            {iframeUrl}
          </div>
        </div>
        <div className="DocumentPage__main__previewBar__locales">
          <Select
            data={localeOptions}
            placeholder="Locale"
            radius="xl"
            size="xs"
            required
            icon={<IconWorld size={16} strokeWidth={1.5} />}
            value={selectedLocale}
            onChange={(newValue: string) => {
              setSelectedLocale(newValue);
            }}
          />
        </div>
        <div className="DocumentPage__main__previewBar__buttons">
          <Tooltip label="Reload">
            <ActionIcon
              className="DocumentPage__main__previewBar__button DocumentPage__main__previewBar__button--reload"
              onClick={() => onReloadClick()}
            >
              <IconReload size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Open new tab">
            <ActionIcon
              className="DocumentPage__main__previewBar__button DocumentPage__main__previewBar__button--openNewTab"
              onClick={() => openNewTab()}
            >
              <IconArrowUpRight size={16} />
            </ActionIcon>
          </Tooltip>
        </div>
      </div>
      <div
        className="DocumentPage__main__previewFrame"
        data-device={device || 'full'}
        style={iframeStyle}
      >
        {device && (
          <div className="DocumentPage__main__previewFrame__deviceLabel">
            {`${device}: ${DeviceResolution[device].join('x')}`}
          </div>
        )}
        <div className="DocumentPage__main__previewFrame__iframeWrap">
          <iframe ref={iframeRef} src={previewPath} />
        </div>
      </div>
    </div>
  );
};
