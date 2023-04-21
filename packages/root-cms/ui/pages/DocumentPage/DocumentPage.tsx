import {ActionIcon, Tooltip} from '@mantine/core';
import {
  IconArrowLeft,
  IconArrowUpRight,
  IconDeviceDesktop,
  IconDeviceIpad,
  IconDeviceMobile,
  IconReload,
} from '@tabler/icons-preact';
import {useEffect, useRef, useState} from 'preact/hooks';

import {DocEditor} from '../../components/DocEditor/DocEditor.js';
import {SplitPanel} from '../../components/SplitPanel/SplitPanel.js';
import {Layout} from '../../layout/Layout.js';
import {joinClassNames} from '../../utils/classes.js';
import {getDocPreviewPath, getDocServingPath} from '../../utils/doc-urls.js';
import './DocumentPage.css';
import {DraftController} from '../../hooks/useDraft.js';

interface DocumentPageProps {
  collection: string;
  slug: string;
}

export function DocumentPage(props: DocumentPageProps) {
  const collectionId = props.collection;
  const slug = props.slug;
  const docId = `${collectionId}/${slug}`;
  const collection = window.__ROOT_CTX.collections[collectionId];
  const [draft, setDraft] = useState<DraftController | null>(null);

  if (!collection) {
    return <div>Could not find collection.</div>;
  }

  return (
    <Layout>
      <SplitPanel className="DocumentPage" localStorageId="DocumentPage">
        <SplitPanel.Item className="DocumentPage__side">
          <div className="DocumentPage__side__header">
            <a href={`/cms/content/${collectionId}`}>
              <ActionIcon className="DocumentPage__side__header__back">
                <IconArrowLeft size={16} />
              </ActionIcon>
            </a>
            <div className="DocumentPage__side__header__docId">{docId}</div>
          </div>
          <div className="DocumentPage__side__editor">
            <DocEditor
              collection={collection}
              docId={docId}
              onDraftController={(draft) => setDraft(draft)}
            />
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
  draft: DraftController | null;
}

type Device = 'mobile' | 'tablet' | 'desktop' | '';

const DeviceResolution = {
  mobile: [360, 800],
  tablet: [768, 1024],
  desktop: [1440, 800],
};

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
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current!;
    function onIframeLoad() {
      console.log('iframe load', iframe.contentWindow?.document.title);
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
    return () => {
      iframe.removeEventListener('load', onIframeLoad);
    };
  }, []);

  function toggleDevice(device: Device) {
    setDevice((current) => {
      if (current === device) {
        return '';
      }
      return device;
    });
  }

  function reload() {
    const reloadIframe = () => {
      const iframe = iframeRef.current!;
      iframe.src = 'about:blank';
      window.setTimeout(() => {
        if (iframe.src !== previewPath) {
          iframe.src = previewPath;
        } else {
          iframe.contentWindow!.location.reload();
        }
      }, 20);
    };
    // Save any unsaved changes and then reload the iframe.
    if (props.draft) {
      props.draft.flush().then(() => reloadIframe());
    } else {
      reloadIframe();
    }
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
        <div className="DocumentPage__main__previewBar__buttons">
          <Tooltip label="Reload">
            <ActionIcon
              className="DocumentPage__main__previewBar__button DocumentPage__main__previewBar__button--reload"
              onClick={() => reload()}
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
