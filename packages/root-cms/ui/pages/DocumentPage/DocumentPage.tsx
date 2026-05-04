import './DocumentPage.css';

import {ActionIcon, Button, Tooltip} from '@mantine/core';
import {useHotkeys} from '@mantine/hooks';
import {
  IconArrowLeft,
  IconArrowUpRight,
  IconBraces,
  IconDeviceFloppy,
  IconLayoutSidebarRightCollapse,
  IconLayoutSidebarRightExpand,
} from '@tabler/icons-preact';
import {useCallback, useEffect, useMemo, useRef, useState} from 'preact/hooks';
import {ChecksPanel} from '../../components/ChecksPanel/ChecksPanel.js';
import {ConditionalTooltip} from '../../components/ConditionalTooltip/ConditionalTooltip.js';
import {DocEditor} from '../../components/DocEditor/DocEditor.js';
import {
  DocumentPagePreviewBar,
  type Device,
} from '../../components/DocumentPagePreviewBar/DocumentPagePreviewBar.js';
import {useEditJsonModal} from '../../components/EditJsonModal/EditJsonModal.js';
import {SearchPanel} from '../../components/SearchPanel/SearchPanel.js';
import {
  SplitPanel,
  useSplitPanel,
} from '../../components/SplitPanel/SplitPanel.js';
import {DraftDocProvider, useDraftDoc} from '../../hooks/useDraftDoc.js';
import {useLocalStorage} from '../../hooks/useLocalStorage.js';
import {usePageTitle} from '../../hooks/usePageTitle.js';
import {useProjectRoles} from '../../hooks/useProjectRoles.js';
import {useStringParam} from '../../hooks/useQueryParam.js';
import {Layout} from '../../layout/Layout.js';
import {joinClassNames} from '../../utils/classes.js';
import {getDocPreviewPath, getDocServingPath} from '../../utils/doc-urls.js';
import {testCanEdit} from '../../utils/permissions.js';

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
  // Avoid passing through internal CMS params (locale, modal) to the preview
  // iframe. These are used by the CMS UI only.
  // NOTE(stevenle): if we ever need to pass through the locale param, switch to
  // using hash params for the internal CMS params that shouldn't pass through.
  searchParams.delete('locale');
  searchParams.delete('modal');
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
  const {roles} = useProjectRoles();
  const currentUserEmail = window.firebase.user.email || '';
  const canEdit = testCanEdit(roles, currentUserEmail);
  return (
    <DraftDocProvider docId={docId} readOnly={!canEdit}>
      <DocumentPageLayout {...props} canEdit={canEdit} />
    </DraftDocProvider>
  );
}

function DocumentPageLayout(props: DocumentPageProps & {canEdit: boolean}) {
  const canEdit = props.canEdit;

  const collectionId = props.collection;
  const slug = props.slug;
  const docId = `${collectionId}/${slug}`;
  usePageTitle(docId);
  const collection = window.__ROOT_CTX.collections[collectionId];
  const draft = useDraftDoc();
  const hasCollectionUrl = !!collection?.url;
  const [isPreviewVisible, setIsPreviewVisible] = useLocalStorage<boolean>(
    `root::DocumentPage::previewVisible::${collectionId}`,
    hasCollectionUrl
  );
  const hasChecks = useMemo(() => {
    const allChecks = window.__ROOT_CTX.checks || [];
    return allChecks.some(
      (c: {collections?: string[]}) =>
        !c.collections || c.collections.includes(collectionId)
    );
  }, [collectionId]);
  const [isChecksVisible, setIsChecksVisible] = useLocalStorage<boolean>(
    'root::DocumentPage::checksVisible',
    false
  );
  const isChecksVisibleRef = useRef(isChecksVisible);
  isChecksVisibleRef.current = isChecksVisible;

  const [isSearchVisible, setIsSearchVisible] = useLocalStorage<boolean>(
    'root::DocumentPage::searchVisible',
    false
  );
  const isSearchVisibleRef = useRef(isSearchVisible);
  isSearchVisibleRef.current = isSearchVisible;

  // Broadcast checks visibility so the StatusBar button can reflect it.
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('root:checks-visible', {detail: isChecksVisible})
    );
  }, [isChecksVisible]);

  // Broadcast search visibility so the StatusBar button can reflect it.
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('root:search-visible', {detail: isSearchVisible})
    );
  }, [isSearchVisible]);

  const [savedChecksPanelWidth, setSavedChecksPanelWidth] =
    useLocalStorage<number>('root::DocumentPage::checksPanelWidth', 360);
  const [checksPanelWidth, setChecksPanelWidth] = useState(
    savedChecksPanelWidth
  );
  const [isDraggingChecks, setIsDraggingChecks] = useState(false);
  const checksLayoutRef = useRef<HTMLDivElement>(null);

  const [savedSearchPanelWidth, setSavedSearchPanelWidth] =
    useLocalStorage<number>('root::DocumentPage::searchPanelWidth', 360);
  const [searchPanelWidth, setSearchPanelWidth] = useState(
    savedSearchPanelWidth
  );
  const [isDraggingSearch, setIsDraggingSearch] = useState(false);

  // Only one right-hand panel (Checks or Search) is allowed open at a time.
  // Opening either panel closes the other.
  useEffect(() => {
    const handler = () => {
      const willBeVisible = !isChecksVisibleRef.current;
      setIsChecksVisible(() => willBeVisible);
      if (willBeVisible) {
        setIsSearchVisible(() => false);
      }
    };
    window.addEventListener('root:toggle-checks', handler);
    return () => window.removeEventListener('root:toggle-checks', handler);
  }, []);

  // Listen for toggle event from DocEditor's Search button. Always focus the
  // search input on open (whether the panel was already open or not).
  useEffect(() => {
    const handler = () => {
      const willBeVisible = !isSearchVisibleRef.current;
      setIsSearchVisible(() => willBeVisible);
      if (willBeVisible) {
        setIsChecksVisible(() => false);
        // Defer to allow the panel to mount before dispatching focus.
        requestAnimationFrame(() => {
          window.dispatchEvent(new CustomEvent('root:focus-search'));
        });
      }
    };
    window.addEventListener('root:toggle-search', handler);
    return () => window.removeEventListener('root:toggle-search', handler);
  }, []);

  // Handle checks panel resize dragging.
  useEffect(() => {
    if (!isDraggingChecks) return;
    const onMouseMove = (e: MouseEvent) => {
      const container = checksLayoutRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const newWidth = Math.max(200, Math.min(rect.right - e.clientX, 800));
      setChecksPanelWidth(newWidth);
    };
    const onMouseUp = () => {
      setIsDraggingChecks(false);
      // Persist to localStorage only on mouseUp.
      setChecksPanelWidth((w) => {
        setSavedChecksPanelWidth(() => w);
        return w;
      });
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDraggingChecks]);

  // Handle search panel resize dragging.
  useEffect(() => {
    if (!isDraggingSearch) return;
    const onMouseMove = (e: MouseEvent) => {
      const container = checksLayoutRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const newWidth = Math.max(240, Math.min(rect.right - e.clientX, 800));
      setSearchPanelWidth(newWidth);
    };
    const onMouseUp = () => {
      setIsDraggingSearch(false);
      setSearchPanelWidth((w) => {
        setSavedSearchPanelWidth(() => w);
        return w;
      });
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDraggingSearch]);

  if (!collection) {
    return <div>Could not find collection.</div>;
  }

  const openPreviewInNewTab = useCallback(() => {
    if (!hasCollectionUrl) {
      return;
    }
    const previewUrl = getPreviewUrl(collectionId, slug);
    // `noopener,noreferrer` used for `testEmbedMode()`.
    const tab = window.open(previewUrl, '_blank', 'noopener,noreferrer');
    if (tab) {
      tab.focus();
    }
  }, [hasCollectionUrl, collectionId, slug]);

  const saveDraft = useCallback(() => {
    if (canEdit && draft.controller) {
      draft.controller.flush();
    }
  }, [canEdit, draft.controller]);

  const editJsonModal = useEditJsonModal();

  const editJson = useCallback(() => {
    const data = draft.controller?.getData()?.fields || {};
    editJsonModal.open({
      data: data,
      onSave: (newValue) => {
        if (draft.controller && newValue && typeof newValue === 'object') {
          draft.controller.updateKey('fields', newValue);
          draft.controller.flush();
        }
        editJsonModal.close();
      },
    });
  }, [draft.controller]);

  const toggleSearch = useCallback(() => {
    window.dispatchEvent(new CustomEvent('root:toggle-search'));
  }, []);

  useHotkeys([
    ['mod+S', saveDraft],
    ['mod+shift+F', toggleSearch],
  ]);

  return (
    <Layout>
      <div
        className={joinClassNames(
          'DocumentPage__layout',
          (isDraggingChecks || isDraggingSearch) &&
            'DocumentPage__layout--dragging'
        )}
        ref={checksLayoutRef}
      >
        <SplitPanel className="DocumentPage" localStorageId="DocumentPage">
          <SplitPanel.Item
            className={joinClassNames(
              'DocumentPage__side',
              (!hasCollectionUrl || !isPreviewVisible) &&
                'DocumentPage__side--expanded'
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
                <ConditionalTooltip
                  label="You don't have access to edit this document"
                  condition={!canEdit}
                >
                  <Button
                    className="DocumentPage__side__header__saveButton"
                    variant="filled"
                    color="dark"
                    size="xs"
                    compact
                    leftIcon={<IconDeviceFloppy size={16} />}
                    onClick={() => saveDraft()}
                    disabled={!canEdit}
                  >
                    Save
                  </Button>
                </ConditionalTooltip>
                <ConditionalTooltip
                  label="You don't have access to edit this document"
                  condition={!canEdit}
                >
                  <Tooltip label="Edit JSON" disabled={!canEdit}>
                    <ActionIcon
                      className="DocumentPage__side__header__editJson"
                      onClick={() => editJson()}
                      disabled={!canEdit}
                    >
                      <IconBraces size={14} />
                    </ActionIcon>
                  </Tooltip>
                </ConditionalTooltip>
                {hasCollectionUrl && (
                  <>
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
                  </>
                )}
              </div>
            </div>
            <div
              className={joinClassNames(
                'DocumentPage__side__editor',
                (!hasCollectionUrl || !isPreviewVisible) &&
                  !isChecksVisible &&
                  !isSearchVisible &&
                  'DocumentPage__side__editor--centered'
              )}
            >
              <DocEditor docId={docId} />
            </div>
          </SplitPanel.Item>
          <SplitPanel.Item
            className={joinClassNames(
              'DocumentPage__main',
              (!hasCollectionUrl || !isPreviewVisible) &&
                'DocumentPage__main--hidden'
            )}
            fluid
          >
            {hasCollectionUrl && isPreviewVisible && (
              <DocumentPage.Preview key={docId} docId={docId} />
            )}
          </SplitPanel.Item>
        </SplitPanel>
        {hasChecks && isChecksVisible && (
          <>
            <div
              className="DocumentPage__checksDivider"
              onMouseDown={() => setIsDraggingChecks(true)}
            />
            <div
              className="DocumentPage__checks"
              style={{flexBasis: `${checksPanelWidth}px`}}
            >
              <ChecksPanel docId={docId} />
            </div>
          </>
        )}
        {isSearchVisible && (
          <>
            <div
              className="DocumentPage__searchDivider"
              onMouseDown={() => setIsDraggingSearch(true)}
            />
            <div
              className="DocumentPage__search"
              style={{flexBasis: `${searchPanelWidth}px`}}
            >
              <SearchPanel
                docId={docId}
                autoFocus
                onClose={() => setIsSearchVisible(() => false)}
              />
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

interface PreviewProps {
  docId: string;
}

const DeviceResolution = {
  mobile: [430, 932],
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
  const draft = useDraftDoc();
  // TODO(stevenle): add a loader here instead.
  if (draft.loading) {
    return null;
  }

  const [collectionId, slug] = props.docId.split('/');
  const collections = window.__ROOT_CTX.collections;
  const rootCollection = collections[collectionId];
  if (!rootCollection) {
    throw new Error(`collection not found: ${collectionId}`);
  }
  if (!rootCollection.url) {
    return null;
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
  const [expandVertically, setExpandVertically] = useLocalStorage<boolean>(
    'root::DocumentPage::preview::expandVertically',
    false
  );
  const [iframeStyle, setIframeStyle] = useState({
    '--iframe-width': '100%',
    '--iframe-height': '100%',
    '--iframe-scale': '1',
  });
  const [selectedLocale, setSelectedLocale] = useStringParam('locale', '');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const locales = draft.controller!.getLocales() || [];
  const splitPanel = useSplitPanel();

  const localizedPreviewUrl = getPreviewUrl(collectionId, slug, selectedLocale);

  const localeOptions = useMemo(
    () => [
      {value: '', label: 'Select locale'},
      ...locales.map((locale) => ({
        value: locale,
        label: getLocaleLabel(locale),
      })),
    ],
    [locales]
  );

  function reloadIframe() {
    // Don't reload the iframe when the tab is hidden. Browsers throttle
    // background timers, so the intermediate about:blank may never resolve,
    // leaving the iframe blank when the user returns.
    if (document.hidden) {
      return;
    }
    const iframe = iframeRef.current!;
    iframe.src = 'about:blank';
    window.requestAnimationFrame(() => {
      if (iframe.src !== localizedPreviewUrl) {
        iframe.src = localizedPreviewUrl;
      } else {
        iframe.contentWindow!.location.reload();
      }
    });
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

    const removeOnFlush = draft.controller?.onFlush(() => {
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

  const toggleDevice = useCallback(
    (targetDevice: Device) => {
      setDevice((current: Device) => {
        const nextDevice = current === targetDevice ? '' : targetDevice;
        if (nextDevice === '') {
          setExpandVertically(false);
        }
        return nextDevice;
      });
    },
    [setDevice, setExpandVertically]
  );

  const toggleExpandVertically = useCallback(() => {
    setDevice((currentDevice: Device) => {
      if (currentDevice) {
        setExpandVertically((current) => !current);
      }
      return currentDevice;
    });
  }, [setDevice, setExpandVertically]);

  const onReloadClick = useCallback(() => {
    // Save any unsaved changes and then reload the iframe.
    if (draft.controller) {
      draft.controller.flush().then(() => reloadIframe());
    }
  }, [draft.controller]);

  const openNewTab = useCallback(() => {
    const previewUrl = getPreviewUrl(collectionId, slug, selectedLocale);
    // `noopener,noreferrer` used for `testEmbedMode()`.
    const tab = window.open(previewUrl, '_blank', 'noopener,noreferrer');
    if (tab) {
      tab.focus();
    }
  }, [collectionId, slug, selectedLocale]);

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
    const availableWidth = Math.max(rect.width - 2 * padding, 0);
    const availableHeight = Math.max(rect.height - 2 * padding, 0);

    // Calculate scale factors, clamping to 1 if not constraining in that dimension
    const widthScale =
      availableWidth > 0 && width > 0 ? availableWidth / width : 1;
    const heightScale =
      availableHeight > 0 && height > 0 ? availableHeight / height : 1;

    // Apply the most restrictive scale (smallest value < 1), or 1 if neither is constraining
    const scale = Math.min(widthScale, heightScale, 1);

    const normalizedScale = Number(scale.toFixed(4)) || 1;

    // When expanding vertically, adjust iframe height to fill available space
    const iframeHeight = expandVertically
      ? `${availableHeight / normalizedScale}px`
      : `${height}px`;

    setIframeStyle({
      '--iframe-width': `${width}px`,
      '--iframe-height': iframeHeight,
      '--iframe-scale': String(normalizedScale),
    });
  }

  useEffect(() => {
    updateIframeStyle();
    // Listen for split panel resize events
    const unsubscribe = splitPanel.onResize(updateIframeStyle);
    // Maintain the aspect ratio when the window is resized.
    window.addEventListener('resize', updateIframeStyle);
    return () => {
      unsubscribe();
      window.removeEventListener('resize', updateIframeStyle);
    };
  }, [device, splitPanel, expandVertically]);

  return (
    <div className="DocumentPage__main__preview">
      <DocumentPagePreviewBar
        device={device}
        expandVertically={expandVertically}
        iframeUrl={iframeUrl}
        localeOptions={localeOptions}
        selectedLocale={selectedLocale}
        onToggleDevice={toggleDevice}
        onToggleExpandVertically={toggleExpandVertically}
        onReloadClick={onReloadClick}
        onOpenNewTab={openNewTab}
        onLocaleChange={setSelectedLocale}
      />
      <div
        className="DocumentPage__main__previewFrame"
        data-device={device || 'full'}
        style={iframeStyle}
      >
        {/* The `display: none` inline style is needed to prevent the vdom from re-using the div component for the iframe wrapper below. */}
        <div
          className="DocumentPage__main__previewFrame__deviceLabel"
          style={{display: device ? undefined : 'none'}}
        >
          {device ? `${device}: ${DeviceResolution[device].join('x')}` : ''}
        </div>
        <div className="DocumentPage__main__previewFrame__iframeWrap">
          <iframe ref={iframeRef} title="iframe preview" />
        </div>
      </div>
    </div>
  );
};
