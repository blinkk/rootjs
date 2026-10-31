import './DocumentPage.css';

import {
  IconArrowLeft,
  IconArrowUpRight,
  IconBraces,
  IconDeviceFloppy,
  IconLayoutSidebarRightCollapse,
  IconLayoutSidebarRightExpand,
} from '@tabler/icons-preact';
import {ComponentChildren} from 'preact';
import {useCallback, useEffect, useMemo, useRef, useState} from 'preact/hooks';
import {useLocation} from 'preact-iso';
import {isNavigateToDocMessage} from '../../../../../shared/embed-protocol.js';
import {Layout} from '../../../../app/layout/Layout.js';
import {lazyComponent} from '../../../../app/lazy-component.js';
import {ConditionalTooltip} from '../../../../components/ConditionalTooltip/ConditionalTooltip.js';
import {SplitPanel} from '../../../../components/SplitPanel/SplitPanel.js';
import {Text} from '../../../../components/Text/Text.js';
import {useLocalStorage} from '../../../../hooks/useLocalStorage.js';
import {useMediaQuery} from '../../../../hooks/useMediaQuery.js';
import {usePageTitle} from '../../../../hooks/usePageTitle.js';
import {useStringParam} from '../../../../hooks/useQueryParam.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {Checkbox} from '../../../../primitives/Checkbox/Checkbox.js';
import {IconButton} from '../../../../primitives/IconButton/IconButton.js';
import {useModals} from '../../../../primitives/modals/ModalsProvider.js';
import {cn} from '../../../../utils/classes.js';
import {testAiEnabled} from '../../../ai/ai.js';
import {CommentsPanel} from '../../../comments/CommentsPanel/CommentsPanel.js';
import {
  COMMENTS_VISIBLE_EVENT,
  FieldCommentsProvider,
  OPEN_FIELD_COMMENTS_EVENT,
  OpenFieldCommentsEventDetail,
  TOGGLE_COMMENTS_EVENT,
} from '../../../comments/useFieldComments.js';
import {ChecksPanel} from '../../../releases/components/ChecksPanel/ChecksPanel.js';
import {testCanEdit} from '../../../users/permissions.js';
import {useProjectRoles} from '../../../users/useProjectRoles.js';
import {DocEditor} from '../../components/DocEditor/DocEditor.js';
import {DocIdBadge} from '../../components/DocIdBadge/DocIdBadge.js';
import {
  DocumentPagePreviewBar,
  type DeviceType,
} from '../../components/DocumentPagePreviewBar/DocumentPagePreviewBar.js';
import {useEditJsonModal} from '../../components/EditJsonModal/useEditJsonModal.js';
import {SearchPanel} from '../../components/SearchPanel/SearchPanel.js';
import {
  DOC_RESTORED_EVENT,
  DocRestoredEventDetail,
} from '../../components/VersionHistoryModal/useVersionHistoryModal.js';
import {getDocPreviewPath, getDocServingPath} from '../../doc-urls.js';
import {isAllowedOrigin} from '../../embed-bridge.js';
import {testEnableChannelFromPreview} from '../../iframe-preview.js';
import {
  getPreviewPathFromUrlKey,
  getPreviewSearch,
  getPreviewSrcFromUrlKey,
  getPreviewUrlKey,
  getPreviewUrlKeyFromUrl,
} from '../../preview-url-sync.js';
import {DraftDocProvider, useDraftDoc} from '../../useDraftDoc.js';

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
  // Avoid passing through internal CMS params (locale, modal, deeplink) to the
  // preview. These are used by the CMS UI only.
  // NOTE(stevenle): if we ever need to pass through the locale param, switch to
  // using hash params for the internal CMS params that shouldn't pass through.
  const query = `${getPreviewSearch(window.location.search)}${
    window.location.hash
  }`;
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

/** A keyboard shortcut and its handler, e.g. `['mod+S', save]`. */
type Hotkey = [string, (e: KeyboardEvent) => void];

/**
 * Returns whether a keydown event matches a shortcut like `mod+shift+F`,
 * where `mod` is Cmd or Ctrl. Modifiers must match exactly.
 */
function testHotkey(hotkey: string, e: KeyboardEvent): boolean {
  const parts = hotkey
    .toLowerCase()
    .split('+')
    .map((part) => part.trim());
  const mods = ['alt', 'ctrl', 'meta', 'shift', 'mod'];
  const key = parts.find((part) => !mods.includes(part));
  if (parts.includes('alt') !== e.altKey) {
    return false;
  }
  if (parts.includes('mod')) {
    if (!e.ctrlKey && !e.metaKey) {
      return false;
    }
  } else if (
    parts.includes('ctrl') !== e.ctrlKey ||
    parts.includes('meta') !== e.metaKey
  ) {
    return false;
  }
  if (parts.includes('shift') !== e.shiftKey) {
    return false;
  }
  return Boolean(
    key &&
    (e.key.toLowerCase() === key ||
      e.code.replace('Key', '').toLowerCase() === key)
  );
}

/**
 * Runs page-level keyboard shortcuts. Like Mantine's `useHotkeys`, it skips
 * keys typed into inputs, textareas and selects.
 */
function useHotkeys(hotkeys: Hotkey[]) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
      ) {
        return;
      }
      hotkeys.forEach(([hotkey, handler]) => {
        if (testHotkey(hotkey, e)) {
          e.preventDefault();
          handler(e);
        }
      });
    };
    document.documentElement.addEventListener('keydown', onKeyDown);
    return () => {
      document.documentElement.removeEventListener('keydown', onKeyDown);
    };
  }, [hotkeys]);
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
      <FieldCommentsProvider docId={docId}>
        <DocumentPageLayout {...props} canEdit={canEdit} />
      </FieldCommentsProvider>
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
  // Below `md` there's no room for a side-by-side preview: the page shows
  // just the editor, with a button that opens the preview in a new tab.
  const isDesktop = useMediaQuery('(width >= 48rem)');
  const showPreview = hasCollectionUrl && isPreviewVisible && isDesktop;
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

  const [isCommentsVisible, setIsCommentsVisible] = useLocalStorage<boolean>(
    'root::DocumentPage::commentsVisible',
    false
  );
  const isCommentsVisibleRef = useRef(isCommentsVisible);
  isCommentsVisibleRef.current = isCommentsVisible;
  const [focusCommentFieldKey, setFocusCommentFieldKey] = useState<
    string | null
  >(null);

  // Broadcast comments visibility so the StatusBar button can reflect it.
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(COMMENTS_VISIBLE_EVENT, {detail: isCommentsVisible})
    );
  }, [isCommentsVisible]);

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

  // Only one right-hand panel (Checks, Search, AI, Comments) is allowed open
  // at a time. Opening any one of them closes the others.
  useEffect(() => {
    const handler = () => {
      const willBeVisible = !isChecksVisibleRef.current;
      setIsChecksVisible(() => willBeVisible);
      if (willBeVisible) {
        setIsSearchVisible(() => false);
        setIsAiVisible(() => false);
        setIsCommentsVisible(() => false);
      }
    };
    window.addEventListener('root:toggle-checks', handler);
    return () => window.removeEventListener('root:toggle-checks', handler);
  }, []);

  // Listen for toggle events from the DocEditor's Comments button.
  useEffect(() => {
    const handler = () => {
      const willBeVisible = !isCommentsVisibleRef.current;
      setIsCommentsVisible(() => willBeVisible);
      if (willBeVisible) {
        setIsChecksVisible(() => false);
        setIsSearchVisible(() => false);
        setIsAiVisible(() => false);
      }
    };
    window.addEventListener(TOGGLE_COMMENTS_EVENT, handler);
    return () => window.removeEventListener(TOGGLE_COMMENTS_EVENT, handler);
  }, []);

  // Listen for requests to open the comments panel on a specific field (e.g.
  // from the field header's comment popover).
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<OpenFieldCommentsEventDetail>).detail;
      if (!detail?.fieldKey) {
        return;
      }
      setIsCommentsVisible(() => true);
      setIsChecksVisible(() => false);
      setIsSearchVisible(() => false);
      setIsAiVisible(() => false);
      setFocusCommentFieldKey(detail.fieldKey);
    };
    window.addEventListener(OPEN_FIELD_COMMENTS_EVENT, handler);
    return () => window.removeEventListener(OPEN_FIELD_COMMENTS_EVENT, handler);
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
        setIsCommentsVisible(() => false);
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
        setIsCommentsVisible(() => false);
      }
    };
    window.addEventListener('root:toggle-ai', handler);
    return () => window.removeEventListener('root:toggle-ai', handler);
  }, []);

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

  const isEditorCentered =
    !showPreview && !isChecksVisible && !isSearchVisible && !isAiVisible;

  return (
    <Layout>
      <div className="DocumentPage__layout relative flex">
        <SplitPanel
          className="DocumentPage min-w-0 flex-1 w-auto!"
          localStorageId="DocumentPage"
        >
          <SplitPanel.Item
            className={cn(
              'DocumentPage__side',
              !showPreview && 'DocumentPage__side--expanded flex-1! max-w-none!'
            )}
          >
            <div className="DocumentPage__side__header sticky top-0 z-(--cms-z-sticky) flex h-9 items-center justify-between gap-6 border-0 border-b border-solid border-border bg-surface px-1 text-sm font-semibold max-md:gap-2">
              <div className="DocumentPage__side__header__nav flex min-w-0 items-center gap-1">
                <IconButton
                  className="DocumentPage__side__header__back text-fg"
                  href={`/cms/content/${collectionId}`}
                  label={`Back to ${collectionId}`}
                >
                  <IconArrowLeft />
                </IconButton>
                <div className="DocumentPage__side__header__docId truncate">
                  {docId}
                </div>
              </div>
              <div className="DocumentPage__side__header__buttons flex shrink-0 items-center gap-0.5">
                {canEdit && <DocEditor.UndoRedoButtons />}
                <ConditionalTooltip
                  label="You don't have access to edit this document"
                  condition={!canEdit}
                >
                  <Button
                    className="DocumentPage__side__header__saveButton mr-2 min-w-18"
                    variant="primary"
                    size="xs"
                    icon={<IconDeviceFloppy />}
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
                  <IconButton
                    className="DocumentPage__side__header__editJson *:size-3.5"
                    label="Edit JSON"
                    tooltip={canEdit}
                    onClick={() => editJson()}
                    disabled={!canEdit}
                  >
                    <IconBraces />
                  </IconButton>
                </ConditionalTooltip>
                {hasCollectionUrl && (
                  <>
                    {isDesktop && (
                      <IconButton
                        className="DocumentPage__side__header__previewToggle"
                        label={
                          isPreviewVisible ? 'Hide preview' : 'Show preview'
                        }
                        onClick={() => setIsPreviewVisible(!isPreviewVisible)}
                      >
                        {isPreviewVisible ? (
                          <IconLayoutSidebarRightCollapse />
                        ) : (
                          <IconLayoutSidebarRightExpand />
                        )}
                      </IconButton>
                    )}
                    {!showPreview && (
                      <IconButton
                        className="DocumentPage__side__header__openNewTab"
                        label="Open preview in new tab"
                        onClick={openPreviewInNewTab}
                      >
                        <IconArrowUpRight />
                      </IconButton>
                    )}
                  </>
                )}
              </div>
            </div>
            <div
              className={cn(
                'DocumentPage__side__editor',
                isEditorCentered
                  ? 'DocumentPage__side__editor--centered flex justify-center p-4 *:w-full *:max-w-200'
                  : 'p-4 pb-100'
              )}
            >
              <DocEditor key={docId} docId={docId} />
            </div>
          </SplitPanel.Item>
          <SplitPanel.Item
            className={cn(
              'DocumentPage__main w-full',
              !showPreview && 'DocumentPage__main--hidden hidden'
            )}
            fluid
          >
            {showPreview && <DocumentPage.Preview key={docId} docId={docId} />}
          </SplitPanel.Item>
        </SplitPanel>
        {hasChecks && isChecksVisible && (
          <DocumentPageChecksPanel
            docId={docId}
            onClose={() => setIsChecksVisible(() => false)}
          />
        )}
        {isSearchVisible && (
          <DocumentPageSidePanel
            name="search"
            storageKey="root::DocumentPage::searchPanelWidth"
            defaultWidth={360}
            minWidth={240}
          >
            <SearchPanel
              docId={docId}
              autoFocus
              onClose={() => setIsSearchVisible(() => false)}
            />
          </DocumentPageSidePanel>
        )}
        {isAiConfigured && isAiVisible && (
          <DocumentPageAiPanel docId={docId} onClose={closeAi} />
        )}
        {isCommentsVisible && (
          <DocumentPageSidePanel
            name="comments"
            storageKey="root::DocumentPage::commentsPanelWidth"
            defaultWidth={380}
            minWidth={280}
          >
            <CommentsPanel
              docId={docId}
              focusFieldKey={focusCommentFieldKey}
              onFocusHandled={() => setFocusCommentFieldKey(null)}
              onClose={() => setIsCommentsVisible(() => false)}
            />
          </DocumentPageSidePanel>
        )}
      </div>
    </Layout>
  );
}

interface DocumentPageSidePanelProps {
  /**
   * The panel's BEM element name: `ai` renders `DocumentPage__ai` and its
   * resize handle `DocumentPage__aiDivider`.
   */
  name: string;
  /** The localStorage key that remembers the panel's width. */
  storageKey: string;
  /** Width in px until the user resizes the panel. */
  defaultWidth: number;
  /** The narrowest the panel can be dragged, in px. */
  minWidth: number;
  children: ComponentChildren;
}

/**
 * A panel on the right of the doc page (Checks, Search, Root AI or
 * Comments), with a drag handle on its left edge that resizes it. Its width
 * state lives here so resizing doesn't re-render the page. Below `md` it
 * covers the editor instead, full-screen, and can't be resized.
 */
function DocumentPageSidePanel(props: DocumentPageSidePanelProps) {
  const {name, minWidth} = props;
  const [savedWidth, setSavedWidth] = useLocalStorage<number>(
    props.storageKey,
    props.defaultWidth
  );
  const [width, setWidth] = useState(savedWidth);
  const dividerRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(width);
  const dragCleanupRef = useRef<() => void>();

  const startDragging = useCallback(() => {
    const layout = dividerRef.current?.parentElement;
    if (!layout) return;
    widthRef.current = width;
    layout.classList.add('DocumentPage__layout--dragging');
    const onMouseMove = (e: MouseEvent) => {
      const container = dividerRef.current?.parentElement;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const newWidth = Math.max(
        minWidth,
        Math.min(rect.right - e.clientX, 800)
      );
      widthRef.current = newWidth;
      setWidth(newWidth);
    };
    const cleanup = () => {
      layout.classList.remove('DocumentPage__layout--dragging');
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      dragCleanupRef.current = undefined;
    };
    const onMouseUp = () => {
      cleanup();
      setSavedWidth(() => widthRef.current);
    };
    dragCleanupRef.current = cleanup;
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [width, minWidth, setSavedWidth]);

  useEffect(() => {
    return () => dragCleanupRef.current?.();
  }, []);

  return (
    <>
      <div
        className={cn(
          `DocumentPage__${name}Divider`,
          'relative w-0.75 flex-none cursor-col-resize max-md:hidden',
          'before:absolute before:inset-y-0 before:left-px before:w-px before:bg-border',
          'after:absolute after:inset-0 after:transition-colors hover:after:bg-accent'
        )}
        ref={dividerRef}
        onMouseDown={startDragging}
      />
      <div
        className={cn(
          `DocumentPage__${name}`,
          'max-h-full flex-none overflow-hidden bg-surface',
          'max-md:absolute max-md:inset-0 max-md:z-(--cms-z-sticky)'
        )}
        style={{flexBasis: `${width}px`}}
      >
        {props.children}
      </div>
    </>
  );
}

interface DocumentPageAiPanelProps {
  docId: string;
  onClose: () => void;
}

/** The AI SDKs are large, so they load when the panel first opens. */
const RootAIChat = lazyComponent(() =>
  import('../../../ai/components/RootAIChat/RootAIChat.js').then(
    (m) => m.RootAIChat
  )
);

/**
 * Renders the Root AI panel. Memoizes the chat so drag-resizing the panel
 * doesn't re-render the conversation tree.
 */
function DocumentPageAiPanel(props: DocumentPageAiPanelProps) {
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
  return (
    <DocumentPageSidePanel
      name="ai"
      storageKey="root::DocumentPage::aiPanelWidth"
      defaultWidth={420}
      minWidth={280}
    >
      {aiChat}
    </DocumentPageSidePanel>
  );
}

interface DocumentPageChecksPanelProps {
  docId: string;
  onClose: () => void;
}

/**
 * Renders the checks panel. Memoizes it so drag-resizing the panel doesn't
 * re-render the checks. The checks panel has no close button of its own, so
 * on mobile, where it covers the editor, a bar above it leads back.
 */
function DocumentPageChecksPanel(props: DocumentPageChecksPanelProps) {
  const checksPanel = useMemo(
    () => <ChecksPanel docId={props.docId} />,
    [props.docId]
  );
  return (
    <DocumentPageSidePanel
      name="checks"
      storageKey="root::DocumentPage::checksPanelWidth"
      defaultWidth={360}
      minWidth={200}
    >
      <div className="DocumentPage__checksInner flex h-full flex-col">
        <div className="DocumentPage__checksBack shrink-0 border-0 border-b border-solid border-border p-1 md:hidden">
          <Button
            variant="subtle"
            size="xs"
            icon={<IconArrowLeft />}
            onClick={props.onClose}
          >
            Back to editor
          </Button>
        </div>
        <div className="DocumentPage__checksBody min-h-0 flex-1">
          {checksPanel}
        </div>
      </div>
    </DocumentPageSidePanel>
  );
}

interface PreviewProps {
  docId: string;
}

/**
 * The answer to remember when the user ticks "don't ask again" in the
 * confirmation below: `true` to keep following, `false` to stop following, and
 * `null` to keep asking.
 *
 * Scoped to the page session rather than persisted: following is only useful
 * for a stretch of browsing, and a decision made once shouldn't quietly
 * outlive it. Reloading the CMS asks again.
 */
let rememberedFollowAnswer: boolean | null = null;

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
  const {route} = useLocation();
  const modals = useModals();
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
  }

  /**
   * Returns whether a doc id from the preview names a real collection and a
   * well-formed slug. Without this a previewed page could send the editor to
   * an arbitrary route.
   */
  function testDocIdIsValid(docId: string): boolean {
    const parts = docId.split('/');
    if (parts.length !== 2) {
      return false;
    }
    const [collection, slug] = parts;
    // The slug isn't matched against the CMS slug pattern: docs created before
    // it was enforced would stop being reachable. Rejecting dot segments and
    // requiring a known collection is what keeps the route well-formed.
    if (!collection || !slug || slug === '.' || slug === '..') {
      return false;
    }
    return Boolean(window.__ROOT_CTX.collections[collection]);
  }

  /**
   * Switches the editor to the doc a preview pane says it is showing.
   *
   * The doc id comes from the previewed page itself (see `navigateToDoc()` in
   * the browser client), so there is nothing to derive from the url. It is
   * still untrusted input -- any page the pane can reach could post it -- so
   * the collection and slug are validated before routing anywhere.
   */
  function navigateToDoc(docId: string, options?: {confirm?: boolean}) {
    if (docId === props.docId || !testDocIdIsValid(docId)) {
      return;
    }
    // Confirm unless the site opted out. The editor switching docs on its own
    // is disorienting for someone who doesn't know the page can ask for it.
    if (options?.confirm === false || rememberedFollowAnswer === true) {
      openDoc(docId);
      return;
    }
    // The user asked not to be prompted again and said no last time.
    if (rememberedFollowAnswer === false) {
      return;
    }
    // Read on confirm rather than through state: the checkbox only has to be
    // correct at the moment the user accepts, so there's nothing to re-render.
    let dontAskAgain = false;
    modals.openConfirmModal({
      title: 'The preview has changed',
      children: (
        <>
          <Text size="body-sm" weight="semi-bold">
            Do you want to load this page in the editor?
          </Text>
          <DocIdBadge docId={docId} />
          <Checkbox
            className="DocumentPage__followConfirm__dontAsk mt-4"
            label="Don't ask again this session"
            color="blue"
            onChange={(e) => {
              dontAskAgain = (e.currentTarget as HTMLInputElement).checked;
            }}
          />
        </>
      ),
      labels: {confirm: 'Yes', cancel: 'No'},
      cancelProps: {size: 'xs'},
      confirmProps: {size: 'xs'},
      onConfirm: () => {
        if (dontAskAgain) {
          rememberedFollowAnswer = true;
        }
        openDoc(docId);
      },
      onCancel: () => {
        if (dontAskAgain) {
          rememberedFollowAnswer = false;
        }
      },
    });
  }

  /** Routes the editor to a doc the preview asked for. */
  function openDoc(docId: string) {
    // Autosave runs on a delay, so a navigation can land mid-window. This
    // isn't awaited: the update is handed to Firestore before the route
    // changes, and the controller flushes again when it's disposed.
    draft.controller?.flush();
    const params = new URLSearchParams(window.location.search);
    // Both of these point at a field in the doc being left behind.
    params.delete('modal');
    params.delete('deeplink');
    const query = params.toString();
    const [collection, slug] = docId.split('/');
    const path = `/cms/content/${encodeURIComponent(
      collection
    )}/${encodeURIComponent(slug)}`;
    // Push, so the doc the editor came from stays in the back stack. The
    // iframe's own navigation doesn't add a top-level entry, so replacing here
    // would discard the previous doc and leave the back button doing nothing.
    route(`${path}${query ? `?${query}` : ''}`);
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

  // Listen for a preview pane asking the editor to open another doc. Only
  // messages from this page's own preview iframes are accepted, so an
  // unrelated frame can't drive the editor.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!testEnableChannelFromPreview() || !isAllowedOrigin(event.origin)) {
        return;
      }
      const isOwnPane = Array.from(iframeRefs.current.values()).some(
        (iframe) => iframe.contentWindow === event.source
      );
      if (!isOwnPane || !isNavigateToDocMessage(event.data)) {
        return;
      }
      const req = event.data.navigateToDoc;
      navigateToDoc(req.docId, {confirm: req.confirm});
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [props.docId]);

  // Reload every visible preview iframe whenever the draft is flushed.
  useEffect(() => {
    const removeOnFlush = draft.controller?.onFlush(() => {
      reloadAllIframes();
    });
    return () => {
      removeOnFlush?.();
    };
  }, [draft.controller]);

  // Restoring a version writes to the draft directly rather than through the
  // controller, so it doesn't trigger a flush. Reload the preview explicitly.
  useEffect(() => {
    const onRestored = (e: Event) => {
      const detail = (e as CustomEvent<DocRestoredEventDetail>).detail;
      if (detail?.docId === props.docId) {
        reloadAllIframes();
      }
    };
    window.addEventListener(DOC_RESTORED_EVENT, onRestored);
    return () => window.removeEventListener(DOC_RESTORED_EVENT, onRestored);
  }, [props.docId]);

  // Navigate every visible iframe to the localized preview url. Runs on mount
  // (initial load) and whenever the selected locale changes.
  useEffect(() => {
    iframeRefs.current.forEach((iframe) => {
      setIframeSrc(iframe, localizedPreviewUrl);
    });
  }, [selectedLocale]);

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
  }, [previewCount]);

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

  const isFullPreview = devices.length === 0;

  return (
    <div className="DocumentPage__main__preview flex h-full flex-col">
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
        className="DocumentPage__main__previewFrame relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden bg-surface-hover"
        data-device={isFullPreview ? 'full' : 'device'}
        ref={previewFrameRef}
      >
        <div
          className={cn(
            'DocumentPage__main__previewFrame__group flex max-h-full max-w-full items-center justify-center',
            isFullPreview ? 'size-full' : 'gap-4'
          )}
        >
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
                className={cn(
                  'DocumentPage__main__previewFrame__item flex flex-none flex-col items-center gap-2',
                  isFullPreview && 'size-full'
                )}
                style={panelStyle}
              >
                <div className="DocumentPage__main__previewFrame__iframeWrap">
                  <iframe
                    ref={getIframeRef(panel.slot)}
                    title="iframe preview"
                  />
                </div>
                {device && (
                  <div className="DocumentPage__main__previewFrame__deviceLabel shrink-0 whitespace-nowrap text-sm leading-none text-muted">
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
