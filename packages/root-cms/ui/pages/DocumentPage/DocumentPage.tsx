import './DocumentPage.css';
import {ActionIcon, Button, Select, Tooltip} from '@mantine/core';
import {useHotkeys} from '@mantine/hooks';
import {
  IconArrowLeft,
  IconArrowUpRight,
  IconBraces,
  IconDeviceDesktop,
  IconDeviceFloppy,
  IconDeviceIpad,
  IconDeviceMobile,
  IconReload,
  IconWorld,
  IconLayoutSidebarRightCollapse,
  IconLayoutSidebarRightExpand,
} from '@tabler/icons-preact';
import {useEffect, useRef, useState} from 'preact/hooks';
import {DocEditor} from '../../components/DocEditor/DocEditor.js';
import {useEditJsonModal} from '../../components/EditJsonModal/EditJsonModal.js';
import {SplitPanel} from '../../components/SplitPanel/SplitPanel.js';
import {UseDraftHook, useDraft} from '../../hooks/useDraft.js';
import {useLocalStorage} from '../../hooks/useLocalStorage.js';
import {Layout} from '../../layout/Layout.js';
import {joinClassNames} from '../../utils/classes.js';
import {getDocPreviewPath, getDocServingPath} from '../../utils/doc-urls.js';

interface DocumentPageProps {
  collection: string;
  slug: string;
}

/** Builds the preview URL for a document. */
function getPreviewUrl(
  collectionId: string,
  slug: string,
  selectedLocale = ''
) {
  const basePreviewPath = getDocPreviewPath({collectionId, slug});
  const searchParams = new URLSearchParams(window.location.search);
  searchParams.set('preview', 'true');
  const query = `${searchParams.toString()}${window.location.hash}`;
  if (selectedLocale) {
    const localizedPreviewPath = getDocPreviewPath({
      collectionId,
      slug,
      locale: selectedLocale,
    });
    return `${localizedPreviewPath}?${query}`;
  }
  return `${basePreviewPath}?${query}`;
}

export function DocumentPage(props: DocumentPageProps) {
  const collectionId = props.collection;
  const slug = props.slug;
  const docId = `${collectionId}/${slug}`;
  const collection = window.__ROOT_CTX.collections[collectionId];
  const draft = useDraft(docId);
  const [isPreviewVisible, setIsPreviewVisible] = useLocalStorage<boolean>(
    `root::DocumentPage::previewVisible::${collectionId}`,
    true
  );

  if (!collection) {
    return <div>Could not find collection.</div>;
  }

  function openPreviewInNewTab() {
    const previewUrl = getPreviewUrl(collectionId, slug);
    // `noopener,noreferrer` used for `testEmbedMode()`.
    const tab = window.open(previewUrl, '_blank', 'noopener,noreferrer');
    if (tab) {
      tab.focus();
    }
  }

  function saveDraft() {
    draft.controller.flush();
  }

  const editJsonModal = useEditJsonModal();

  const editJson = () => {
    editJsonModal.open({
      data: draft.data?.fields || {},
      onSave: (newValue) => {
        if (newValue && typeof newValue === 'object') {
          draft.controller.updateKey('fields', newValue);
          draft.controller.flush();
        }
        editJsonModal.close();
      },
    });
  };

  useHotkeys([['mod+S', () => saveDraft()]]);

  return (
    <Layout>
      <SplitPanel className="DocumentPage" localStorageId="DocumentPage">
        <SplitPanel.Item
          className={joinClassNames(
            'DocumentPage__side',
            !isPreviewVisible && 'DocumentPage__side--expanded'
          )}
        >
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
                className="DocumentPage__side__header__saveButton"
                variant="filled"
                color="dark"
                size="xs"
                compact
                leftIcon={<IconDeviceFloppy size={16} />}
                onClick={() => saveDraft()}
              >
                Save
              </Button>
              <Tooltip label="Edit JSON">
                <ActionIcon
                  className="DocumentPage__side__header__editJson"
                  onClick={() => editJson()}
                >
                  <IconBraces size={14} />
                </ActionIcon>
              </Tooltip>
              {/* <Menu
                className="DocumentPage__side__header__menu"
                position="bottom"
                control={
                  <ActionIcon className="DocumentPage__side__header__menu__dots">
                    <IconDotsVertical size={16} />
                  </ActionIcon>
                }
              >
                <Menu.Item
                  icon={<IconBraces size={20} />}
                  onClick={() => editJson()}
                >
                  Edit JSON
                </Menu.Item>
              </Menu> */}
              <Tooltip
                label={isPreviewVisible ? 'Hide preview' : 'Show preview'}
              >
                <ActionIcon
                  className="DocumentPage__side__header__previewToggle"
                  onClick={() => setIsPreviewVisible(!isPreviewVisible)}
                >
                  {isPreviewVisible ? (
                    <IconLayoutSidebarRightCollapse size={16} />
                  ) : (
                    <IconLayoutSidebarRightExpand size={16} />
                  )}
                </ActionIcon>
              </Tooltip>
              {!isPreviewVisible && (
                <Tooltip label="Open preview in new tab">
                  <ActionIcon
                    className="DocumentPage__side__header__openNewTab"
                    onClick={openPreviewInNewTab}
                  >
                    <IconArrowUpRight size={16} />
                  </ActionIcon>
                </Tooltip>
              )}
            </div>
          </div>
          <div
            className={joinClassNames(
              'DocumentPage__side__editor',
              !isPreviewVisible && 'DocumentPage__side__editor--centered'
            )}
          >
            <DocEditor
              key={docId}
              collection={collection}
              docId={docId}
              draft={draft}
            />
          </div>
        </SplitPanel.Item>
        <SplitPanel.Item
          className={joinClassNames(
            'DocumentPage__main',
            !isPreviewVisible && 'DocumentPage__main--hidden'
          )}
          fluid
        >
          {isPreviewVisible && (
            <DocumentPage.Preview key={docId} docId={docId} draft={draft} />
          )}
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

DocumentPage.Preview = (props: PreviewProps) => {
  const [collectionId, slug] = props.docId.split('/');
  const collections = window.__ROOT_CTX.collections;
  const rootCollection = collections[collectionId];
  if (!rootCollection) {
    throw new Error(`collection not found: ${collectionId}`);
  }
  const domain =
    rootCollection.domain ||
    window.__ROOT_CTX.rootConfig.domain ||
    'https://example.com';
  const servingPath = getDocServingPath({collectionId, slug});
  const basePreviewPath = getDocPreviewPath({collectionId, slug});
  const servingUrl = `${domain}${servingPath}`;

  const [iframeUrl, setIframeUrl] = useState(servingUrl);
  const [device, setDevice] = useLocalStorage<Device>(
    'root::DocumentPage::preview::device',
    ''
  );
  const [iframeStyle, setIframeStyle] = useState({
    '--iframe-width': '100%',
    '--iframe-height': '100%',
    '--iframe-scale': '1',
  });
  const [selectedLocale, setSelectedLocale] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const locales = props.draft.controller.getLocales();

  const previewUrl = getPreviewUrl(collectionId, slug);
  const localizedPreviewUrl = getPreviewUrl(collectionId, slug, selectedLocale);

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
      if (iframe.src !== localizedPreviewUrl) {
        iframe.src = localizedPreviewUrl;
      } else {
        iframe.contentWindow!.location.reload();
      }
    }, 30);
  }

  useEffect(() => {
    const iframe = iframeRef.current!;
    function onIframeLoad() {
      const iframeWindow = iframe.contentWindow;
      if (!iframeWindow) {
        return;
      }
      // Whenever the iframe url changes (e.g. user navigates to a different
      // page), update the iframe url bar. Note that if the preview path is
      // different than the serving path, then the serving path will always be
      // displayed regardless of the iframe url changes.
      if (
        basePreviewPath === servingPath &&
        !iframeWindow.location.href.startsWith('about:blank')
      ) {
        const currentPath = iframeWindow.location.pathname;
        // console.log(`iframe url change: ${currentPath}`);
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
    const iframe = iframeRef.current!;
    iframe.src = localizedPreviewUrl;
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
    const previewUrl = getPreviewUrl(collectionId, slug, selectedLocale);
    // `noopener,noreferrer` used for `testEmbedMode()`.
    const tab = window.open(previewUrl, '_blank', 'noopener,noreferrer');
    if (tab) {
      tab.focus();
    }
  }

  useEffect(() => {
    function updateIframeStyle() {
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
    }
    updateIframeStyle();
    // Maintain the aspect ratio when the window is resized.
    // Without this, the iframe gets cut off.
    window.addEventListener('resize', updateIframeStyle);
    return () => {
      window.removeEventListener('resize', updateIframeStyle);
    };
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
          <iframe ref={iframeRef} src={previewUrl} title="iframe preview" />
        </div>
      </div>
    </div>
  );
};
