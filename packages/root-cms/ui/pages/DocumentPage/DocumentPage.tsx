import './DocumentPage.css';

import {ActionIcon, Button, Loader, Tooltip} from '@mantine/core';
import {useHotkeys} from '@mantine/hooks';
import {showNotification} from '@mantine/notifications';
import {
  IconArrowLeft,
  IconArrowUpRight,
  IconBraces,
  IconDeviceFloppy,
  IconLayoutSidebarRightCollapse,
  IconLayoutSidebarRightExpand,
  IconRoute,
} from '@tabler/icons-preact';
import {useCallback, useEffect, useMemo, useRef, useState} from 'preact/hooks';
import {useLocation} from 'preact-iso';
import {ChecksPanel} from '../../components/ChecksPanel/ChecksPanel.js';
import {ConditionalTooltip} from '../../components/ConditionalTooltip/ConditionalTooltip.js';
import {DocEditor} from '../../components/DocEditor/DocEditor.js';
import {
  DocumentPagePreviewBar,
  type DeviceType,
} from '../../components/DocumentPagePreviewBar/DocumentPagePreviewBar.js';
import {useEditJsonModal} from '../../components/EditJsonModal/EditJsonModal.js';
import {RootAIChat} from '../../components/RootAIChat/RootAIChat.js';
import {SearchPanel} from '../../components/SearchPanel/SearchPanel.js';
import {SplitPanel} from '../../components/SplitPanel/SplitPanel.js';
import {DraftDocProvider, useDraftDoc} from '../../hooks/useDraftDoc.js';
import {useLocalStorage} from '../../hooks/useLocalStorage.js';
import {usePageTitle} from '../../hooks/usePageTitle.js';
import {useProjectRoles} from '../../hooks/useProjectRoles.js';
import {useStringParam} from '../../hooks/useQueryParam.js';
import {Layout} from '../../layout/Layout.js';
import {testAiEnabled} from '../../utils/ai.js';
import {joinClassNames} from '../../utils/classes.js';
import {getDocPreviewPath, getDocServingPath} from '../../utils/doc-urls.js';
import {
  FollowTarget,
  resolveFollowTarget,
  resetFollowRateLimit,
  testFollowRateLimit,
} from '../../utils/follow-mode.js';
import {testCanEdit} from '../../utils/permissions.js';
import {getPreviewDocCandidates} from '../../utils/preview-doc-match.js';
import {
  getPreviewPathFromUrlKey,
  getPreviewSrcFromUrlKey,
  getPreviewUrlKey,
  getPreviewUrlKeyFromUrl,
} from '../../utils/preview-url-sync.js';

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

/**
 * Builds the URL to use when reloading the preview iframe.
 *
 * Preserves query params and hash that the child frame may have added (e.g.
 * preview/debug flags toggled inside the previewed page) so they survive
 * content-triggered reloads, while still forcing `preview=true` on.
 *
 * Only reuses the child URL when its pathname matches the expected preview
 * path -- if the user has navigated the iframe to an unrelated page, we
 * deliberately reset back to the canonical preview URL rather than reloading
 * whatever site happens to be loaded.
 */
function getReloadUrl(iframe: HTMLIFrameElement, fallbackUrl: string) {
  const reloadUrl = new URL(fallbackUrl, window.location.origin);
  try {
    const currentHref = iframe.contentWindow?.location.href;
    if (currentHref && !currentHref.startsWith('about:blank')) {
      const currentUrl = new URL(currentHref);
      if (
        currentUrl.origin === reloadUrl.origin &&
        currentUrl.pathname === reloadUrl.pathname
      ) {
        // Carry over any params/hash the child added on top of the canonical
        // preview URL.
        currentUrl.searchParams.forEach((value, key) => {
          reloadUrl.searchParams.set(key, value);
        });
        reloadUrl.hash = currentUrl.hash;
      }
    }
  } catch {
    // Cross-origin or otherwise unreadable iframe location -- fall back to the
    // canonical preview URL.
  }
  reloadUrl.searchParams.set('preview', 'true');
  return reloadUrl.toString();
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
  // Global rather than per-collection: following a link is exactly the case
  // where the user crosses from one collection into another.
  const [isFollowMode, setIsFollowMode] = useLocalStorage<boolean>(
    'root::DocumentPage::followMode',
    false
  );

  const toggleFollowMode = useCallback(() => {
    setIsFollowMode((current) => {
      if (!current) {
        resetFollowRateLimit();
      }
      return !current;
    });
  }, [setIsFollowMode]);

  const disableFollowMode = useCallback(() => {
    setIsFollowMode(() => false);
  }, [setIsFollowMode]);

  // True while follow mode is resolving which doc the preview navigated to.
  // The editor's own loading overlay takes over once the route changes.
  const [isFollowing, setIsFollowing] = useState(false);
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

  const isAiConfigured = testAiEnabled();
  const [isAiVisible, setIsAiVisible] = useLocalStorage<boolean>(
    'root::DocumentPage::aiVisible',
    false
  );
  const isAiVisibleRef = useRef(isAiVisible);
  isAiVisibleRef.current = isAiVisible;

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

  // Broadcast AI panel visibility so the StatusBar button can reflect it.
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('root:ai-visible', {detail: isAiVisible})
    );
  }, [isAiVisible]);

  const [savedSearchPanelWidth, setSavedSearchPanelWidth] =
    useLocalStorage<number>('root::DocumentPage::searchPanelWidth', 360);
  const [searchPanelWidth, setSearchPanelWidth] = useState(
    savedSearchPanelWidth
  );
  const [isDraggingSearch, setIsDraggingSearch] = useState(false);
  const layoutRef = useRef<HTMLDivElement>(null);

  // Only one right-hand panel (Checks, Search, AI) is allowed open at a time.
  // Opening any one of them closes the others.
  useEffect(() => {
    const handler = () => {
      const willBeVisible = !isChecksVisibleRef.current;
      setIsChecksVisible(() => willBeVisible);
      if (willBeVisible) {
        setIsSearchVisible(() => false);
        setIsAiVisible(() => false);
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
        setIsAiVisible(() => false);
        // Defer to allow the panel to mount before dispatching focus.
        requestAnimationFrame(() => {
          window.dispatchEvent(new CustomEvent('root:focus-search'));
        });
      }
    };
    window.addEventListener('root:toggle-search', handler);
    return () => window.removeEventListener('root:toggle-search', handler);
  }, []);

  // Listen for toggle event from DocEditor's AI button and the Mod+I hotkey.
  useEffect(() => {
    const handler = () => {
      const willBeVisible = !isAiVisibleRef.current;
      setIsAiVisible(() => willBeVisible);
      if (willBeVisible) {
        setIsChecksVisible(() => false);
        setIsSearchVisible(() => false);
      }
    };
    window.addEventListener('root:toggle-ai', handler);
    return () => window.removeEventListener('root:toggle-ai', handler);
  }, []);

  // Handle search panel resize dragging.
  useEffect(() => {
    if (!isDraggingSearch) return;
    const onMouseMove = (e: MouseEvent) => {
      const container = layoutRef.current;
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

  const toggleAi = useCallback(() => {
    if (!isAiConfigured) {
      return;
    }
    window.dispatchEvent(new CustomEvent('root:toggle-ai'));
  }, [isAiConfigured]);

  const closeAi = useCallback(() => {
    setIsAiVisible(() => false);
  }, [setIsAiVisible]);

  useHotkeys([
    ['mod+S', saveDraft],
    ['mod+shift+F', toggleSearch],
    ['mod+I', toggleAi],
  ]);

  return (
    <Layout>
      <div
        className={joinClassNames(
          'DocumentPage__layout',
          isDraggingSearch && 'DocumentPage__layout--dragging'
        )}
        ref={layoutRef}
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
                {canEdit && <DocEditor.UndoRedoButtons />}
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
                    {isPreviewVisible && (
                      <Tooltip
                        label={
                          isFollowMode
                            ? 'Stop following preview navigation'
                            : 'Follow preview navigation'
                        }
                      >
                        <ActionIcon
                          className={joinClassNames(
                            'DocumentPage__side__header__followToggle',
                            isFollowMode && 'active'
                          )}
                          aria-label="Follow preview navigation"
                          aria-pressed={isFollowMode}
                          aria-busy={isFollowing}
                          onClick={toggleFollowMode}
                        >
                          {isFollowing ? (
                            <Loader size={14} />
                          ) : (
                            <IconRoute size={16} />
                          )}
                        </ActionIcon>
                      </Tooltip>
                    )}
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
                  !isAiVisible &&
                  'DocumentPage__side__editor--centered'
              )}
            >
              <DocEditor key={docId} docId={docId} />
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
              <DocumentPage.Preview
                docId={docId}
                followMode={isFollowMode}
                onDisableFollowMode={disableFollowMode}
                onFollowingChange={setIsFollowing}
              />
            )}
          </SplitPanel.Item>
        </SplitPanel>
        {hasChecks && isChecksVisible && (
          <DocumentPageChecksPanel docId={docId} />
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
        {isAiConfigured && isAiVisible && (
          <DocumentPageAiPanel docId={docId} onClose={closeAi} />
        )}
      </div>
    </Layout>
  );
}

interface DocumentPageAiPanelProps {
  docId: string;
  onClose: () => void;
}

/**
 * Renders the Root AI panel with resize state isolated from DocumentPageLayout.
 * Memoizes the chat so drag-resizing the panel does not re-render the
 * conversation tree.
 */
function DocumentPageAiPanel(props: DocumentPageAiPanelProps) {
  const [savedAiPanelWidth, setSavedAiPanelWidth] = useLocalStorage<number>(
    'root::DocumentPage::aiPanelWidth',
    420
  );
  const [aiPanelWidth, setAiPanelWidth] = useState(savedAiPanelWidth);
  const dividerRef = useRef<HTMLDivElement>(null);
  const aiPanelWidthRef = useRef(aiPanelWidth);
  const dragCleanupRef = useRef<() => void>();
  const aiChat = useMemo(
    () => (
      <RootAIChat
        variant="panel"
        docContext={{docId: props.docId}}
        onClose={props.onClose}
      />
    ),
    [props.docId, props.onClose]
  );

  const startDragging = useCallback(() => {
    const layout = dividerRef.current?.parentElement;
    if (!layout) return;
    aiPanelWidthRef.current = aiPanelWidth;
    layout.classList.add('DocumentPage__layout--dragging');
    const onMouseMove = (e: MouseEvent) => {
      const container = dividerRef.current?.parentElement;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const newWidth = Math.max(280, Math.min(rect.right - e.clientX, 800));
      aiPanelWidthRef.current = newWidth;
      setAiPanelWidth(newWidth);
    };
    const cleanup = () => {
      layout.classList.remove('DocumentPage__layout--dragging');
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      dragCleanupRef.current = undefined;
    };
    const onMouseUp = () => {
      cleanup();
      setSavedAiPanelWidth(() => aiPanelWidthRef.current);
    };
    dragCleanupRef.current = cleanup;
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [aiPanelWidth, setSavedAiPanelWidth]);

  useEffect(() => {
    return () => dragCleanupRef.current?.();
  }, []);

  return (
    <>
      <div
        className="DocumentPage__aiDivider"
        ref={dividerRef}
        onMouseDown={startDragging}
      />
      <div
        className="DocumentPage__ai"
        style={{flexBasis: `${aiPanelWidth}px`}}
      >
        {aiChat}
      </div>
    </>
  );
}

interface DocumentPageChecksPanelProps {
  docId: string;
}

/** Renders the checks panel with resize state isolated from DocumentPageLayout. */
function DocumentPageChecksPanel(props: DocumentPageChecksPanelProps) {
  const [savedChecksPanelWidth, setSavedChecksPanelWidth] =
    useLocalStorage<number>('root::DocumentPage::checksPanelWidth', 360);
  const [checksPanelWidth, setChecksPanelWidth] = useState(
    savedChecksPanelWidth
  );
  const dividerRef = useRef<HTMLDivElement>(null);
  const checksPanelWidthRef = useRef(checksPanelWidth);
  const dragCleanupRef = useRef<() => void>();
  const checksPanel = useMemo(
    () => <ChecksPanel docId={props.docId} />,
    [props.docId]
  );

  const startDragging = useCallback(() => {
    const layout = dividerRef.current?.parentElement;
    if (!layout) return;
    checksPanelWidthRef.current = checksPanelWidth;
    layout.classList.add('DocumentPage__layout--dragging');
    const onMouseMove = (e: MouseEvent) => {
      const container = dividerRef.current?.parentElement;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const newWidth = Math.max(200, Math.min(rect.right - e.clientX, 800));
      checksPanelWidthRef.current = newWidth;
      setChecksPanelWidth(newWidth);
    };
    const cleanup = () => {
      layout.classList.remove('DocumentPage__layout--dragging');
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      dragCleanupRef.current = undefined;
    };
    const onMouseUp = () => {
      cleanup();
      setSavedChecksPanelWidth(() => checksPanelWidthRef.current);
    };
    dragCleanupRef.current = cleanup;
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [checksPanelWidth, setSavedChecksPanelWidth]);

  useEffect(() => {
    return () => dragCleanupRef.current?.();
  }, []);

  return (
    <>
      <div
        className="DocumentPage__checksDivider"
        ref={dividerRef}
        onMouseDown={startDragging}
      />
      <div
        className="DocumentPage__checks"
        style={{flexBasis: `${checksPanelWidth}px`}}
      >
        {checksPanel}
      </div>
    </>
  );
}

interface PreviewProps {
  docId: string;
  /** When true, navigating within a preview pane switches the edited doc. */
  followMode: boolean;
  /** Switches follow mode off, e.g. when a follow loop is detected. */
  onDisableFollowMode: () => void;
  /** Reports whether a follow is currently resolving, for the progress state. */
  onFollowingChange: (isFollowing: boolean) => void;
}

const DeviceResolution = {
  mobile: [430, 932],
  tablet: [768, 1024],
  desktop: [1440, 800],
};

/** Devices listed in the order they should appear left-to-right. */
const DEVICE_ORDER: DeviceType[] = ['mobile', 'tablet', 'desktop'];

const DEVICES_STORAGE_KEY = 'root::DocumentPage::preview::devices';
const LEGACY_DEVICE_STORAGE_KEY = 'root::DocumentPage::preview::device';

/**
 * Resolves the initial set of selected preview devices, migrating the legacy
 * single-device preference into the new multi-select array when present.
 */
function getInitialDevices(): DeviceType[] {
  try {
    const legacy = window.localStorage.getItem(LEGACY_DEVICE_STORAGE_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      if (DEVICE_ORDER.includes(parsed)) {
        return [parsed];
      }
    }
  } catch (err) {
    console.error(err);
  }
  return [];
}

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
  const initialDevices = useMemo(getInitialDevices, []);
  const [devices, setDevices] = useLocalStorage<DeviceType[]>(
    DEVICES_STORAGE_KEY,
    initialDevices
  );
  const [multiSelect, setMultiSelect] = useLocalStorage<boolean>(
    'root::DocumentPage::preview::multiSelect',
    false
  );
  const [expandVertically, setExpandVertically] = useLocalStorage<boolean>(
    'root::DocumentPage::preview::expandVertically',
    false
  );
  // Shared layout for the device preview iframes. `scale` is the uniform zoom
  // applied to every selected viewport; `frameHeight` is the unscaled iframe
  // height used when expanding vertically.
  const [previewLayout, setPreviewLayout] = useState({
    scale: 1,
    frameHeight: 0,
  });
  const [selectedLocale, setSelectedLocale] = useStringParam('locale', '');
  // Tracks the preview iframes by slot index so flush/reload and locale changes
  // can be applied to every visible viewport.
  const iframeRefs = useRef(new Map<number, HTMLIFrameElement>());
  const iframeRefCallbacks = useRef(
    new Map<number, (el: HTMLIFrameElement | null) => void>()
  );
  // The url the preview panes are expected to be showing. Used to detect when
  // the user navigates within a pane so the other panes can be brought along.
  const syncedUrlKey = useRef<string | null>(null);
  // Mirrors the follow mode prop so `onIframeLoad()`, which is registered once
  // per viewport count change, always reads the live value rather than the
  // value from the render that registered it.
  const followModeRef = useRef(props.followMode);
  followModeRef.current = props.followMode;
  // Discards doc lookups that a newer navigation superseded while they were in
  // flight.
  const followRequestId = useRef(0);
  // The url a follow is currently resolving, so the `load` event doesn't redo
  // the work already started by the click that caused it.
  const followingUrlKey = useRef<string | null>(null);
  // A follow that has resolved and is waiting for the preview to finish
  // loading before the editor switches documents.
  const pendingFollow = useRef<{urlKey: string; target: FollowTarget} | null>(
    null
  );
  // A follow resolves asynchronously, so it can outlive the preview. Routing
  // after that would yank the user away from wherever they navigated in the
  // meantime.
  const isMounted = useRef(true);
  // Set to the doc id follow mode is routing to, so the effect that reacts to a
  // doc change knows the panes are already showing that doc and must be left
  // alone.
  const followedDocId = useRef<string | null>(null);
  const {route} = useLocation();
  const previewFrameRef = useRef<HTMLDivElement>(null);
  // Remembers the viewport selection from before 2-up was enabled so it can be
  // restored when 2-up is turned back off.
  const preMultiSelectDevicesRef = useRef<DeviceType[]>([]);

  /** Returns a stable ref callback that registers the iframe for a given slot. */
  const getIframeRef = useCallback((slot: number) => {
    let callback = iframeRefCallbacks.current.get(slot);
    if (!callback) {
      callback = (el: HTMLIFrameElement | null) => {
        if (el) {
          iframeRefs.current.set(slot, el);
        } else {
          iframeRefs.current.delete(slot);
        }
      };
      iframeRefCallbacks.current.set(slot, callback);
    }
    return callback;
  }, []);

  const locales = draft.controller!.getLocales() || [];

  const localizedPreviewUrl = getPreviewUrl(collectionId, slug, selectedLocale);
  // Keep the latest preview URL in a ref so long-lived callbacks (e.g. the
  // onFlush handler registered once on mount) always reload to the current
  // locale's URL instead of the locale active at mount time.
  const localizedPreviewUrlRef = useRef(localizedPreviewUrl);
  localizedPreviewUrlRef.current = localizedPreviewUrl;

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

  /**
   * Records the page the preview panes are showing and mirrors it into the
   * preview url bar. Note that if the preview path is different than the
   * serving path, then the serving path is always displayed regardless of the
   * iframe url changes.
   */
  function setSyncedUrlKey(urlKey: string | null) {
    syncedUrlKey.current = urlKey;
    if (urlKey && basePreviewPath === servingPath) {
      // Strip query params from the displayed URL so the URL bar mirrors the
      // public/prod URL. This avoids editors accidentally copying preview-only
      // params (e.g. `preview=true`, debug flags) into places like social
      // media. The "open in new tab" button still uses the full preview URL.
      setIframeUrl(`${domain}${getPreviewPathFromUrlKey(urlKey)}`);
    }
  }

  /** Navigates a preview iframe to a url the panes should all be showing. */
  function setIframeSrc(iframe: HTMLIFrameElement, nextUrl: string) {
    setSyncedUrlKey(getPreviewUrlKeyFromUrl(nextUrl));
    iframe.src = nextUrl;
  }

  /**
   * Rewrites same-origin link clicks inside a preview pane so the page they
   * navigate to keeps `preview=true`, and with it draft mode.
   *
   * The previewed site has no reason to carry a CMS-only param on its own
   * links, so without this a click drops the pane into published mode -- while
   * the other panes, which are navigated by the CMS, stay in draft mode. Under
   * follow mode the mismatch is worse: the editor switches to the new doc's
   * draft while the pane beside it renders that doc's published page.
   *
   * Rewriting the click is what keeps this to a single page load. Re-navigating
   * after the fact would load the page twice.
   *
   * The listener is attached per load because the document is replaced on every
   * navigation, which discards the previous one. It runs in the bubble phase so
   * a previewed site that handles its own link clicks (client-side routing,
   * analytics interstitials) still wins, and so the `defaultPrevented` check
   * below has something to observe.
   */
  function keepPreviewParamOnLinkClicks(iframe: HTMLIFrameElement) {
    let doc: Document | null;
    try {
      doc = iframe.contentDocument;
    } catch {
      // Cross-origin: the browser blocks access to the document.
      return;
    }
    if (!doc) {
      return;
    }
    doc.addEventListener('click', (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey
      ) {
        return;
      }
      // `closest()` works across realms; `instanceof` would not, since the
      // iframe has its own copy of the DOM constructors.
      const target = event.target as Element | null;
      const link = target?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!link || link.hasAttribute('download')) {
        return;
      }
      // Links that open elsewhere leave the pane alone.
      if (link.target && !/^_?self$/i.test(link.target)) {
        return;
      }
      let url: URL;
      try {
        url = new URL(link.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) {
        return;
      }
      // An in-page jump isn't a navigation to a different page. Rewriting it
      // would turn a scroll into a full page load.
      const current = iframe.contentWindow?.location;
      if (
        current &&
        url.pathname === current.pathname &&
        url.search === current.search
      ) {
        return;
      }
      // Start following now rather than waiting for the `load` event, so the
      // editor switches documents while the page is still loading instead of
      // afterwards. The `load` handler still follows navigations that don't
      // come from a link click (form posts, redirects, back/forward).
      const urlKey = getPreviewUrlKeyFromUrl(url.toString());
      if (urlKey) {
        followPreviewNavigation(urlKey);
      }
      if (url.searchParams.get('preview') === 'true') {
        return;
      }
      url.searchParams.set('preview', 'true');
      event.preventDefault();
      iframe.contentWindow?.location.assign(url.toString());
    });
  }

  /**
   * Called when a preview iframe finishes loading a page. When the user
   * navigates within a pane (e.g. by clicking a link), every other pane is sent
   * to the same page so all of the viewports stay comparable.
   *
   * Only full page loads are synced. Client-side url changes (history state
   * changes, hash changes) don't fire a load event and are left alone, since
   * they're page-local state rather than a different page.
   */
  function onIframeLoad(event: Event) {
    const iframe = event.currentTarget as HTMLIFrameElement;
    keepPreviewParamOnLinkClicks(iframe);
    let urlKey: string | null = null;
    try {
      const loc = iframe.contentWindow?.location;
      if (loc && loc.href && !loc.href.startsWith('about:blank')) {
        urlKey = getPreviewUrlKey(loc);
      }
    } catch {
      // Cross-origin: the browser blocks reading the location.
      return;
    }
    if (!urlKey || urlKey === syncedUrlKey.current) {
      return;
    }
    setSyncedUrlKey(urlKey);
    const nextUrl = getPreviewSrcFromUrlKey(urlKey);
    iframeRefs.current.forEach((other) => {
      if (other !== iframe) {
        other.src = nextUrl;
      }
    });
    // The page the user clicked has finished loading, so a follow that was
    // resolved at click time can now swap the editor over in step with it.
    // Navigations with no click behind them (form posts, redirects,
    // back/forward) resolve and commit here instead.
    const pending = pendingFollow.current;
    if (pending?.urlKey === urlKey) {
      commitFollow(urlKey, pending.target);
      return;
    }
    followPreviewNavigation(urlKey, {commit: true});
  }

  /**
   * Switches the editor to the doc behind the page a preview pane navigated
   * to, so clicking a link in the preview brings the editor along.
   *
   * Only called for loads the CMS didn't initiate itself (see the guard in
   * `onIframeLoad()`), which is what keeps the CMS's own navigations from
   * following themselves and dedupes the load events from multiple viewports
   * down to a single follow.
   *
   * Pages that aren't CMS docs -- list pages, 404s, marketing routes -- are
   * silently ignored. In follow mode those are common enough that notifying
   * about each one would be unusable, and the preview url bar already shows
   * where the pane went.
   */
  async function followPreviewNavigation(
    urlKey: string,
    options?: {commit?: boolean}
  ) {
    if (!followModeRef.current || followingUrlKey.current === urlKey) {
      return;
    }
    const candidates = getPreviewDocCandidates(
      getPreviewPathFromUrlKey(urlKey)
    );
    if (candidates.length === 0) {
      return;
    }
    // Skip the db lookups entirely when the page is served by the doc already
    // being edited, which covers reloads and redirects back onto the same page.
    // Every candidate is checked, not just the best one: when two docs serve
    // the same url, staying put is better than yanking the editor onto the
    // other one. Checked before the progress state is set so a page that isn't
    // a doc doesn't flash the indicator.
    if (
      candidates.some(
        (candidate) =>
          `${candidate.collectionId}/${candidate.slug}` === props.docId
      )
    ) {
      return;
    }
    followingUrlKey.current = urlKey;
    props.onFollowingChange(true);
    const requestId = ++followRequestId.current;
    let target: FollowTarget | null = null;
    try {
      target = await resolveFollowTarget(candidates);
    } catch (err) {
      console.warn('follow mode: failed to resolve the preview url:', err);
    }
    if (
      !target ||
      target.docId === props.docId ||
      requestId !== followRequestId.current ||
      !followModeRef.current ||
      !isMounted.current
    ) {
      cancelPendingFollow(urlKey);
      return;
    }
    if (options?.commit) {
      commitFollow(urlKey, target);
      return;
    }
    // Hold the resolved target until the preview finishes loading, so the
    // editor and the preview swap to the new doc together. Resolving ahead of
    // time also warms the db cache, so the doc is ready when the swap happens.
    pendingFollow.current = {urlKey: urlKey, target: target};
  }

  /**
   * Switches the editor to an already-resolved doc. Split out from resolution
   * so the swap can be timed to the preview's `load` event rather than
   * happening as soon as the lookup finishes.
   */
  function commitFollow(urlKey: string, target: FollowTarget) {
    cancelPendingFollow(urlKey);
    if (
      !followModeRef.current ||
      !isMounted.current ||
      target.docId === props.docId
    ) {
      return;
    }
    // A page that redirects the preview to another doc would bounce the editor
    // back and forth, so disarm follow mode when navigations come too fast.
    if (!testFollowRateLimit()) {
      props.onDisableFollowMode();
      showNotification({
        title: 'Follow mode turned off',
        message:
          'The preview navigated between documents too quickly. Turn follow mode back on to resume.',
        color: 'yellow',
        autoClose: 8000,
      });
      return;
    }
    // Autosave runs on a delay, so a link click can land mid-window. This isn't
    // awaited: the update is handed to Firestore before the route changes, and
    // the controller flushes again when it's disposed.
    draft.controller?.flush();
    followedDocId.current = target.docId;
    const params = new URLSearchParams(window.location.search);
    // Both of these point at a field in the doc being left behind.
    params.delete('modal');
    params.delete('deeplink');
    if (target.locale) {
      params.set('locale', target.locale);
    } else {
      params.delete('locale');
    }
    const query = params.toString();
    // Replace rather than push: the iframe's own navigation already added a
    // session history entry, so pushing another would make the back button
    // take two presses per followed link.
    route(
      `/cms/content/${target.docId}${query ? `?${query}` : ''}`,
      /* replace= */ true
    );
  }

  /** Clears the in-flight and pending follow state for a url. */
  function cancelPendingFollow(urlKey: string) {
    if (followingUrlKey.current === urlKey) {
      followingUrlKey.current = null;
    }
    if (pendingFollow.current?.urlKey === urlKey) {
      pendingFollow.current = null;
    }
    props.onFollowingChange(false);
  }

  /**
   * Returns the url key of the page the preview panes are showing, read from a
   * live pane rather than from `syncedUrlKey`, which only tracks loads the CMS
   * knows about.
   */
  function getCurrentPreviewUrlKey(): string | null {
    for (const iframe of iframeRefs.current.values()) {
      try {
        const loc = iframe.contentWindow?.location;
        if (loc?.href && !loc.href.startsWith('about:blank')) {
          return getPreviewUrlKey(loc);
        }
      } catch {
        // Cross-origin: the browser blocks reading the location.
      }
    }
    return syncedUrlKey.current;
  }

  /**
   * Returns the url a newly-mounted pane should open at, which is whatever page
   * the other panes are showing (or the doc's preview url when there are none).
   */
  function getInitialIframeSrc(): string {
    if (syncedUrlKey.current) {
      return getPreviewSrcFromUrlKey(syncedUrlKey.current);
    }
    return localizedPreviewUrlRef.current;
  }

  function reloadIframe(iframe: HTMLIFrameElement) {
    // Don't reload the iframe when the tab is hidden. Browsers throttle
    // background timers, so the intermediate about:blank may never resolve,
    // leaving the iframe blank when the user returns.
    if (document.hidden) {
      return;
    }
    const nextUrl = getReloadUrl(iframe, localizedPreviewUrlRef.current);
    setSyncedUrlKey(getPreviewUrlKeyFromUrl(nextUrl));
    iframe.src = 'about:blank';
    window.requestAnimationFrame(() => {
      if (iframe.src !== nextUrl) {
        iframe.src = nextUrl;
      } else {
        iframe.contentWindow!.location.reload();
      }
    });
  }

  function reloadAllIframes() {
    iframeRefs.current.forEach((iframe) => reloadIframe(iframe));
  }

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Catch the editor up when follow mode is switched on. The preview may
  // already be showing a different doc's page, because navigating with follow
  // mode off leaves the two panes out of sync -- switching it on should fix
  // that rather than waiting for the next navigation.
  useEffect(() => {
    if (!props.followMode) {
      return;
    }
    const urlKey = getCurrentPreviewUrlKey();
    if (urlKey) {
      followPreviewNavigation(urlKey, {commit: true});
    }
  }, [props.followMode]);

  // Reload every visible preview iframe whenever the draft is flushed.
  useEffect(() => {
    const removeOnFlush = draft.controller?.onFlush(() => {
      reloadAllIframes();
    });
    return () => {
      removeOnFlush?.();
    };
  }, [draft.controller]);

  // Navigate every visible iframe to the localized preview url. Runs on mount,
  // whenever the selected locale changes, and whenever the edited doc changes
  // (e.g. via global search or a reference field).
  //
  // A doc change that follow mode caused is skipped: the panes are already
  // showing that doc's page, and re-navigating them would reload the page the
  // user just clicked.
  useEffect(() => {
    const followed = followedDocId.current;
    followedDocId.current = null;
    if (followed === props.docId) {
      return;
    }
    iframeRefs.current.forEach((iframe) => {
      setIframeSrc(iframe, localizedPreviewUrl);
    });
  }, [props.docId, selectedLocale]);

  // Wire up newly-mounted iframes when the number of viewports changes (e.g.
  // when a viewport is added to a multi-pane comparison). New iframes are
  // opened at whatever page the other panes are showing and get a load listener
  // that keeps the panes and the url bar in sync; existing iframes keep their
  // current src so they don't reload unnecessarily.
  const previewCount = devices.length > 0 ? devices.length : 1;
  useEffect(() => {
    const iframes = Array.from(iframeRefs.current.values());
    iframes.forEach((iframe) => {
      if (!iframe.getAttribute('src')) {
        setIframeSrc(iframe, getInitialIframeSrc());
      }
      iframe.addEventListener('load', onIframeLoad);
    });
    return () => {
      iframes.forEach((iframe) =>
        iframe.removeEventListener('load', onIframeLoad)
      );
    };
    // `onIframeLoad` closes over the current doc, so the listeners have to be
    // re-registered when the doc changes. The iframes already have a `src` at
    // that point, so this doesn't re-navigate them.
  }, [previewCount, props.docId]);

  const toggleDevice = useCallback(
    (targetDevice: DeviceType) => {
      if (multiSelect) {
        setDevices((current) => {
          if (current.includes(targetDevice)) {
            const next = current.filter((d) => d !== targetDevice);
            if (next.length === 0) {
              setExpandVertically(false);
            }
            return next;
          }
          // Keep the selected viewports in a stable left-to-right order.
          return DEVICE_ORDER.filter(
            (d) => d === targetDevice || current.includes(d)
          );
        });
        return;
      }
      // Single-select: clicking the active viewport returns to the full preview.
      setDevices((current) => {
        const isOnlySelected =
          current.length === 1 && current[0] === targetDevice;
        if (isOnlySelected) {
          setExpandVertically(false);
          return [];
        }
        return [targetDevice];
      });
    },
    [multiSelect, setDevices, setExpandVertically]
  );

  const toggleMultiSelect = useCallback(() => {
    setMultiSelect((current) => {
      const next = !current;
      if (next) {
        // Entering 2-up: remember the current selection, then ensure at least
        // two viewports are shown so the toggle has a visible effect. Pair the
        // active viewport with a contrasting one (mobile/tablet -> desktop,
        // desktop -> mobile).
        setDevices((devs) => {
          preMultiSelectDevicesRef.current = devs;
          if (devs.length >= 2) {
            return devs;
          }
          const primary: DeviceType = devs[0] || 'desktop';
          const companion: DeviceType =
            primary === 'desktop' ? 'mobile' : 'desktop';
          return DEVICE_ORDER.filter((d) => d === primary || d === companion);
        });
      } else {
        // Leaving 2-up: restore whatever was selected before it was enabled.
        setDevices(() => preMultiSelectDevicesRef.current);
      }
      return next;
    });
  }, [setMultiSelect, setDevices]);

  const toggleExpandVertically = useCallback(() => {
    if (devices.length === 0) {
      return;
    }
    setExpandVertically((current) => !current);
  }, [devices, setExpandVertically]);

  const onReloadClick = useCallback(() => {
    // Save any unsaved changes and then reload the iframes.
    if (draft.controller) {
      draft.controller.flush().then(() => reloadAllIframes());
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

  const updatePreviewLayout = useCallback(() => {
    if (devices.length === 0) {
      setPreviewLayout((current) =>
        current.scale === 1 && current.frameHeight === 0
          ? current
          : {scale: 1, frameHeight: 0}
      );
      return;
    }
    const container = previewFrameRef.current;
    if (!container) {
      return;
    }
    const rect = container.getBoundingClientRect();
    const padding = 20;
    // Horizontal gap between viewports in a multi-up comparison.
    const gap = 16;
    // Reserve a little room beneath each iframe for its resolution label.
    const labelReserve = 28;
    const count = devices.length;

    const availableWidth = Math.max(
      rect.width - 2 * padding - gap * (count - 1),
      0
    );
    const availableHeight = Math.max(
      rect.height - 2 * padding - labelReserve,
      0
    );

    // All viewports share a single zoom level. The width budget is split across
    // every viewport's intrinsic width; the height budget is constrained by the
    // tallest viewport so nothing overflows.
    let totalDeviceWidth = 0;
    let maxDeviceHeight = 0;
    for (const d of devices) {
      const [width, height] = DeviceResolution[d];
      totalDeviceWidth += width;
      maxDeviceHeight = Math.max(maxDeviceHeight, height);
    }

    // Calculate scale factors, clamping to 1 if not constraining in that dimension.
    const widthScale =
      availableWidth > 0 && totalDeviceWidth > 0
        ? availableWidth / totalDeviceWidth
        : 1;
    const heightScale =
      availableHeight > 0 && maxDeviceHeight > 0
        ? availableHeight / maxDeviceHeight
        : 1;

    // Apply the most restrictive scale (smallest value < 1), or 1 if neither is constraining.
    const scale = Math.min(widthScale, heightScale, 1);
    const normalizedScale = Number(scale.toFixed(4)) || 1;

    // When expanding vertically, every iframe fills the available height.
    const frameHeight = Math.max(availableHeight / normalizedScale, 0);

    setPreviewLayout((current) =>
      current.scale === normalizedScale && current.frameHeight === frameHeight
        ? current
        : {scale: normalizedScale, frameHeight}
    );
  }, [devices]);

  useEffect(() => {
    updatePreviewLayout();
    const container = previewFrameRef.current;
    if (!container) {
      return;
    }
    let animationFrame = 0;
    const schedulePreviewLayoutUpdate = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(updatePreviewLayout);
    };
    const resizeObserver = new window.ResizeObserver(
      schedulePreviewLayoutUpdate
    );
    resizeObserver.observe(container);
    // Maintain the aspect ratio when the window is resized.
    window.addEventListener('resize', schedulePreviewLayoutUpdate);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      window.removeEventListener('resize', schedulePreviewLayoutUpdate);
    };
  }, [updatePreviewLayout]);

  const previewPanels =
    devices.length > 0
      ? devices.map((device, index) => ({slot: index, device}))
      : [{slot: 0, device: null as DeviceType | null}];

  return (
    <div className="DocumentPage__main__preview">
      <DocumentPagePreviewBar
        devices={devices}
        multiSelect={multiSelect}
        expandVertically={expandVertically}
        iframeUrl={iframeUrl}
        localeOptions={localeOptions}
        selectedLocale={selectedLocale}
        onToggleDevice={toggleDevice}
        onToggleMultiSelect={toggleMultiSelect}
        onToggleExpandVertically={toggleExpandVertically}
        onReloadClick={onReloadClick}
        onOpenNewTab={openNewTab}
        onLocaleChange={setSelectedLocale}
      />
      <div
        className="DocumentPage__main__previewFrame"
        data-device={devices.length > 0 ? 'device' : 'full'}
        ref={previewFrameRef}
      >
        <div className="DocumentPage__main__previewFrame__group">
          {previewPanels.map((panel) => {
            const device = panel.device;
            const panelStyle = device
              ? {
                  '--iframe-width': `${DeviceResolution[device][0]}px`,
                  '--iframe-height': `${
                    expandVertically
                      ? previewLayout.frameHeight
                      : DeviceResolution[device][1]
                  }px`,
                  '--iframe-scale': String(previewLayout.scale),
                }
              : undefined;
            return (
              <div
                key={panel.slot}
                className="DocumentPage__main__previewFrame__item"
                style={panelStyle}
              >
                <div className="DocumentPage__main__previewFrame__iframeWrap">
                  <iframe
                    ref={getIframeRef(panel.slot)}
                    title="iframe preview"
                  />
                </div>
                {device && (
                  <div className="DocumentPage__main__previewFrame__deviceLabel">
                    {`${device}: ${DeviceResolution[device].join('x')}`}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
