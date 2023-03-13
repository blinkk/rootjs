import {ActionIcon, Tooltip} from '@mantine/core';
import {
  IconArrowLeft,
  IconArrowUpRight,
  IconCircleArrowUpRight,
  IconDeviceDesktop,
  IconDeviceIpad,
  IconDeviceLaptop,
  IconDeviceMobile,
  IconReload,
  IconWindowMaximize,
} from '@tabler/icons-preact';
import {useEffect, useReducer, useRef, useState} from 'preact/hooks';
import {SplitPanel} from '../../components/SplitPanel/SplitPanel.js';
import {Layout} from '../../layout/Layout.js';
import {joinClassNames} from '../../utils/classes.js';
import {getDocServingPath, getDocServingUrl} from '../../utils/doc-urls.js';
import {DocumentEditor} from '../DocumentEditor/DocumentEditor.js';
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
            <DocumentEditor collection={collection} docId={docId} />
          </div>
        </SplitPanel.Item>
        <SplitPanel.Item className="DocumentPage__main" fluid>
          <DocumentPage.Preview docId={docId} />
        </SplitPanel.Item>
      </SplitPanel>
    </Layout>
  );
}

interface PreviewProps {
  docId: string;
}

type Device = 'mobile' | 'tablet' | 'desktop' | '';

const DeviceResolution = {
  mobile: [360, 800],
  tablet: [768, 1024],
  desktop: [1440, 800],
};

DocumentPage.Preview = (props: PreviewProps) => {
  const [device, setDevice] = useState<Device>('');
  const [iframeStyle, setIframeStyle] = useState({
    '--iframe-width': '100%',
    '--iframe-height': '100%',
    '--iframe-scale': '1',
  });
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const servingPath = getDocServingPath(props.docId);
  const previewPath = `${servingPath}?preview=true`;
  const domain = window.__ROOT_CTX.rootConfig.domain || 'https://example.com';
  const servingUrl = `${domain}${servingPath}`;

  function toggleDevice(device: Device) {
    setDevice((current) => {
      if (current === device) {
        return '';
      }
      return device;
    });
  }

  function reload() {
    const iframe = iframeRef.current!;
    iframe.src = 'about:blank';
    window.setTimeout(() => {
      if (iframe.src !== previewPath) {
        iframe.src = previewPath;
      } else {
        iframe.contentWindow!.location.reload();
      }
    }, 10);
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
    const container = iframe.parentElement as HTMLElement;
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
            {servingUrl}
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
      >
        {device && (
          <div className="DocumentPage__main__previewFrame__deviceLabel">
            {`${device}: ${DeviceResolution[device].join('x')}`}
          </div>
        )}
        <iframe ref={iframeRef} src={previewPath} style={iframeStyle}></iframe>
      </div>
    </div>
  );
};
