import './DocEditor.css';

import {
  DragDropContext,
  Draggable,
  Droppable,
  DroppableProvided,
  DropResult,
} from '@hello-pangea/dnd';
import {
  IconAlarm,
  IconAlertTriangle,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconBraces,
  IconChevronDown,
  IconChevronRight,
  IconCircleArrowDown,
  IconCircleArrowUp,
  IconCirclePlus,
  IconClipboard,
  IconClipboardCopy,
  IconCopy,
  IconDotsVertical,
  IconGripVertical,
  IconLanguage,
  IconLanguageOff,
  IconLayoutSidebarRight,
  IconListCheck,
  IconLock,
  IconMessageCircle,
  IconPin,
  IconPlanet,
  IconRobot,
  IconRocket,
  IconRowInsertBottom,
  IconRowInsertTop,
  IconSearch,
  IconTrash,
  IconTriangleFilled,
  IconX,
} from '@tabler/icons-preact';
import {ComponentChildren, createContext, RefObject} from 'preact';
import {
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useCallback,
} from 'preact/hooks';
import {useLocation} from 'preact-iso';
import * as schema from '../../../../../core/schema.js';
import {countThreadComments} from '../../../../../shared/comments.js';
import {
  getSiblingDeepKey,
  testShowWhen,
  toFieldConditions,
} from '../../../../../shared/field-conditions.js';
import {
  FIRESTORE_MAX_NESTING_DEPTH,
  getRemainingNestingDepth,
  NESTING_DEPTH_WARNING_BUFFER,
} from '../../../../../shared/nesting.js';
import {ConditionalTooltip} from '../../../../components/ConditionalTooltip/ConditionalTooltip.js';
import {DataLoadError} from '../../../../components/DataLoadError/DataLoadError.js';
import {Text} from '../../../../components/Text/Text.js';
import {useMediaQuery} from '../../../../hooks/useMediaQuery.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {IconButton} from '../../../../primitives/IconButton/IconButton.js';
import {LoadingOverlay} from '../../../../primitives/LoadingOverlay/LoadingOverlay.js';
import {Menu, MenuGroup, MenuItem} from '../../../../primitives/Menu/Menu.js';
import {useModals} from '../../../../primitives/modals/ModalsProvider.js';
import {Popover} from '../../../../primitives/Popover/Popover.js';
import {Select} from '../../../../primitives/Select/Select.js';
import {
  hideNotification,
  showNotification,
} from '../../../../primitives/Toast/toastStore.js';
import {Tooltip} from '../../../../primitives/Tooltip/Tooltip.js';
import {cn} from '../../../../utils/classes.js';
import {debounce} from '../../../../utils/debounce.js';
import {
  isEditableTarget,
  isRedoKeyEvent,
  isUndoKeyEvent,
} from '../../../../utils/keyboard.js';
import {deepMerge} from '../../../../utils/objects.js';
import {autokey} from '../../../../utils/rand.js';
import {formatDateTime} from '../../../../utils/time.js';
import {testAiEnabled} from '../../../ai/ai.js';
import {useAiEditModal} from '../../../ai/components/AiEditModal/AiEditModal.js';
import {IconRootAI} from '../../../ai/components/IconRootAI/IconRootAI.js';
import {useCollectionSchema} from '../../../collections/useCollectionSchema.js';
import {CommentThread} from '../../../comments/CommentThread/CommentThread.js';
import {clampPinnedWindowPosition} from '../../../comments/PinnedCommentThreads/PinnedCommentThreads.js';
import {
  COMMENTS_VISIBLE_EVENT,
  openFieldCommentsPanel,
  TOGGLE_COMMENTS_EVENT,
  useFieldCommentThread,
  useFieldComments,
  useFieldResolvedThreads,
} from '../../../comments/useFieldComments.js';
import {usePinnedCommentThreads} from '../../../comments/usePinnedCommentThreads.js';
import {useLockPublishingModal} from '../../../releases/components/LockPublishingModal/LockPublishingModal.js';
import {usePublishDocModal} from '../../../releases/components/PublishDocModal/PublishDocModal.js';
import {useEditTranslationsModal} from '../../../translations/components/EditTranslationsModal/EditTranslationsModal.js';
import {useLocalizationModal} from '../../../translations/components/LocalizationModal/LocalizationModal.js';
import {
  LocalizedValues,
  LocalizedValuesButton,
  LocalizedValuesFieldProps,
  testLocalizedValuesEnabled,
} from '../../../translations/components/LocalizedValues/LocalizedValues.js';
import {extractField} from '../../../translations/extract.js';
import {testCanEdit, testCanPublish} from '../../../users/permissions.js';
import {useProjectRoles} from '../../../users/useProjectRoles.js';
import {UserAvatarGroup} from '../../../users/UserAvatar/UserAvatar.js';
import {CMSDoc, testIsScheduled, testPublishingLocked} from '../../doc.js';
import {formatFieldPath} from '../../field-labels.js';
import {getDefaultFieldValue, normalizePresetData} from '../../fields.js';
import {requestHighlightNode} from '../../iframe-preview.js';
import {buildPreviewValue} from '../../schema-previews.js';
import {testFieldEmpty} from '../../test-field-empty.js';
import {
  buildDeeplinkUrl,
  DeeplinkProvider,
  scrollToDeeplink,
  useDeeplink,
  whenDeeplinkElementReady,
} from '../../useDeeplink.js';
import {
  DraftDocContext,
  DraftDocController,
  SaveState,
  useDraftDoc,
  useDraftDocField,
  useDraftDocHistory,
  useDraftDocHistoryApplied,
  useDraftDocSaveState,
} from '../../useDraftDoc.js';
import {
  Viewer,
  ViewersProvider,
  useFieldViewers,
  useViewersController,
} from '../../useViewers.js';
import {ClipboardData, useVirtualClipboard} from '../../useVirtualClipboard.js';
import {
  ComponentPickerOption,
  useComponentPickerModal,
} from '../ComponentPickerModal/ComponentPickerModal.js';
import {
  DocActionEvent,
  DocActionsMenu,
} from '../DocActionsMenu/DocActionsMenu.js';
import {
  DocStatusBadges,
  getPublishingLockedLabel,
} from '../DocStatusBadges/DocStatusBadges.js';
import {useEditJsonModal} from '../EditJsonModal/EditJsonModal.js';
import {FieldErrorBoundary} from '../FieldErrorBoundary/FieldErrorBoundary.js';
import {Viewers} from '../Viewers/Viewers.js';
import {BooleanField} from './fields/BooleanField.js';
import {DateField} from './fields/DateField.js';
import {DateTimeField} from './fields/DateTimeField.js';
import {FieldProps} from './fields/FieldProps.js';
import {FileField} from './fields/FileField.js';
import {ImageField} from './fields/ImageField.js';
import {MultiSelectField} from './fields/MultiSelectField.js';
import {NumberField} from './fields/NumberField.js';
import {PasswordField} from './fields/PasswordField.js';
import {ReferenceField} from './fields/ReferenceField.js';
import {ReferencesField} from './fields/ReferencesField.js';
import {RichTextField} from './fields/RichTextField.js';
import {SelectField} from './fields/SelectField.js';
import {StringField} from './fields/StringField.js';

interface DocEditorProps {
  className?: string;
  docId: string;
  hideStatusBar?: boolean;
}

/**
 * Shows a transient notification with an "Undo" button after a destructive
 * one-click action (e.g. removing an array item, clearing a section). The
 * undo is scoped to the history entry that was just created, so it no-ops
 * (with an explanation) if newer edits have landed in the meantime.
 */
function showUndoNotification(draft: DraftDocController, message: string) {
  const entry = draft.history.peekUndo();
  if (!entry) {
    showNotification({message, autoClose: 2000});
    return;
  }
  const notificationId = `undo-${entry.id}`;
  showNotification({
    id: notificationId,
    message: (
      <div className="DocEditor__undoNotification flex items-center justify-between gap-3">
        <Text size="body-sm">{message}</Text>
        <Button
          size="xs"
          onClick={() => {
            hideNotification(notificationId);
            const result = draft.undo({onlyEntryId: entry.id});
            if (result.status === 'empty') {
              showNotification({
                message: 'Newer edits were made. Use ⌘Z to undo step by step.',
                autoClose: 4000,
              });
            } else if (result.status === 'conflict') {
              showNotification({
                title: 'Undo discarded',
                message: 'This field was changed by another editor.',
                color: 'yellow',
                autoClose: 5000,
              });
            }
          }}
        >
          Undo
        </Button>
      </div>
    ),
    autoClose: 4000,
  });
}

const COLLECTION_SCHEMA_CONTEXT = createContext<schema.Collection | null>(null);

/** Returns the full collection schema of the doc being edited, if loaded. */
function useDocCollectionSchema(): schema.Collection | null {
  return useContext(COLLECTION_SCHEMA_CONTEXT);
}

const COLLECTION_SCHEMA_TYPES_CONTEXT = createContext<
  Record<string, schema.Schema>
>({});

/**
 * Returns a map of types defined in the collection's schema.ts file.
 */
function useCollectionSchemaTypes(): Record<string, schema.Schema> {
  return useContext(COLLECTION_SCHEMA_TYPES_CONTEXT);
}

export function DocEditor(props: DocEditorProps) {
  const collectionId = props.docId.split('/')[0];
  // Load the full collection schema.
  const collection = useCollectionSchema(collectionId);
  const draft = useDraftDoc();
  const loading = collection.loading || draft.loading;
  const fields = collection.schema?.fields || [];
  const rootRef = useRef<HTMLDivElement>(null);

  if (draft.error) {
    return (
      <div className={cn('DocEditor relative', props.className)}>
        <DataLoadError title="Failed to load document" error={draft.error} />
      </div>
    );
  }

  const editor = (
    <COLLECTION_SCHEMA_CONTEXT.Provider value={collection?.schema || null}>
      <COLLECTION_SCHEMA_TYPES_CONTEXT.Provider
        value={collection?.schema?.types || {}}
      >
        <DeeplinkProvider>
          <div
            className={cn('DocEditor relative', props.className)}
            ref={rootRef}
          >
            <LoadingOverlay visible={loading} label="Loading document" />
            <DocEditor.HistoryDeeplink rootRef={rootRef} />
            <DocEditor.FocusTracker rootRef={rootRef} />
            {!loading && !props.hideStatusBar && (
              <DocEditor.StatusBar
                {...props}
                draft={draft}
                collection={collection.schema!}
              />
            )}
            {!loading && !props.hideStatusBar && (
              <DocEditor.ScheduledNotice draft={draft} />
            )}
            <div className="DocEditor__fields">
              {fields.map((field) => (
                <DocEditor.Field
                  key={field.id}
                  field={field}
                  deepKey={`fields.${field.id!}`}
                />
              ))}
            </div>
          </div>
        </DeeplinkProvider>
      </COLLECTION_SCHEMA_TYPES_CONTEXT.Provider>
    </COLLECTION_SCHEMA_CONTEXT.Provider>
  );

  // Presence is only tracked for the full editor (i.e. on the document page),
  // not for embedded editors like the reference field editor modal.
  if (props.hideStatusBar) {
    return editor;
  }
  return <ViewersProvider id={`doc/${props.docId}`}>{editor}</ViewersProvider>;
}

type StatusBarProps = DocEditorProps & {
  draft: DraftDocContext;
  collection: schema.Collection;
};

DocEditor.StatusBar = (props: StatusBarProps) => {
  const {route, query} = useLocation();
  const {roles} = useProjectRoles();
  const currentUserEmail = window.firebase.user.email || '';
  const canPublish = testCanPublish(roles, currentUserEmail);
  const canEdit = testCanEdit(roles, currentUserEmail);

  const draft = props.draft;
  const [data, setData] = useState<Partial<CMSDoc> | null>(
    draft.controller.getData()
  );

  // For the status bar, only the "sys" attr on the doc is needed.
  useDraftDocField('sys', (sys: any) => {
    const data: Partial<CMSDoc> = {sys};
    setData(data);
  });

  const onLockChanged = useCallback(
    (state: 'locked' | 'unlocked') => {
      if (state === 'unlocked') {
        // NOTE(stevenle): for some reason, the unlock publishing doesn't
        // properly trigger the `onSnapshot()` callback with
        // `{hasPendingWrites: false}`. This is a temporary fix.
        // TODO(stevenle): avoid the extra db write here.
        draft.controller.removePublishingLock();
      }
    },
    [draft.controller]
  );

  const lockPublishingModal = useLockPublishingModal({
    docId: props.docId,
    onChange: onLockChanged,
  });

  const onDocAction = useCallback(
    (event: DocActionEvent) => {
      if (event.action === 'delete') {
        const collectionId = props.docId.split('/')[0];
        route(`/cms/content/${collectionId}`);
      } else if (event.action === 'unlocked') {
        // NOTE(stevenle): for some reason, the unlock publishing doesn't
        // properly trigger the `onSnapshot()` callback with
        // `{hasPendingWrites: false}`. This is a temporary fix.
        // TODO(stevenle): avoid the extra db write here.
        draft.controller.removePublishingLock();
      }
    },
    [props.docId]
  );

  const onPublishingLockClick = useCallback(() => {
    if (!canEdit) {
      return;
    }
    const lock = data?.sys?.publishingLocked;
    if (!lock) {
      return;
    }
    lockPublishingModal.open({
      existingLock: {
        reason: lock.reason,
        until: lock.until ? lock.until.toMillis() : undefined,
      },
    });
  }, [canEdit, data?.sys?.publishingLocked, lockPublishingModal]);

  const deeplink = useDeeplink();
  const onViewerClick = useCallback(
    (_viewer: Viewer, focusedField: string) => {
      deeplink.setUrlValue(focusedField);
      whenDeeplinkElementReady(focusedField, (element) => {
        scrollToDeeplink(element, {behavior: 'smooth', force: true});
      });
    },
    [deeplink.setUrlValue]
  );
  const getFieldLabel = useCallback(
    (deepKey: string) =>
      formatFieldPath(props.collection, deepKey, (key) =>
        draft.controller.getValue(key)
      ),
    [props.collection, draft.controller]
  );

  const publishDocModal = usePublishDocModal({docId: props.docId});
  const localizationModal = useLocalizationModal();
  const [checksActive, setChecksActive] = useState(() => {
    try {
      const val = window.localStorage.getItem(
        'root::DocumentPage::checksVisible'
      );
      return val ? JSON.parse(val) === true : false;
    } catch {
      return false;
    }
  });
  const [searchActive, setSearchActive] = useState(() => {
    try {
      const val = window.localStorage.getItem(
        'root::DocumentPage::searchVisible'
      );
      return val ? JSON.parse(val) === true : false;
    } catch {
      return false;
    }
  });
  const [aiActive, setAiActive] = useState(() => {
    try {
      const val = window.localStorage.getItem('root::DocumentPage::aiVisible');
      return val ? JSON.parse(val) === true : false;
    } catch {
      return false;
    }
  });
  const aiAvailable = testAiEnabled();
  const fieldComments = useFieldComments();
  const [commentsActive, setCommentsActive] = useState(() => {
    try {
      const val = window.localStorage.getItem(
        'root::DocumentPage::commentsVisible'
      );
      return val ? JSON.parse(val) === true : false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const handler = (e: Event) => {
      setCommentsActive((e as CustomEvent).detail === true);
    };
    window.addEventListener(COMMENTS_VISIBLE_EVENT, handler);
    return () => window.removeEventListener(COMMENTS_VISIBLE_EVENT, handler);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      setChecksActive((e as CustomEvent).detail === true);
    };
    window.addEventListener('root:checks-visible', handler);
    return () => window.removeEventListener('root:checks-visible', handler);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      setSearchActive((e as CustomEvent).detail === true);
    };
    window.addEventListener('root:search-visible', handler);
    return () => window.removeEventListener('root:search-visible', handler);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      setAiActive((e as CustomEvent).detail === true);
    };
    window.addEventListener('root:ai-visible', handler);
    return () => window.removeEventListener('root:ai-visible', handler);
  }, []);

  const urlLocale = (query.locale as string) || '';
  const urlModal = (query.modal as string) || '';

  useEffect(() => {
    if (urlModal === 'localization' && draft.controller) {
      localizationModal.open({
        docId: props.docId,
        collection: props.collection,
        draft: draft.controller,
        locale: urlLocale || undefined,
      });
    }
  }, []);

  const loading = !data?.sys;
  if (loading) {
    return null;
  }

  return (
    <div className="DocEditor__statusBar">
      {/* Below `md` the bar is wider than the header, so the actions come
          first and the presence and status details scroll in after them. */}
      <div className="DocEditor__statusBar__viewers max-md:order-last max-md:ml-2">
        <Viewers
          id={`doc/${props.docId}`}
          onViewerClick={onViewerClick}
          getFieldLabel={getFieldLabel}
        />
      </div>
      <DocEditor.SaveState />
      {data?.sys && (
        <div className="DocEditor__statusBar__statusBadges max-md:order-last max-md:ml-2 md:mr-4">
          <DocStatusBadges
            doc={data as CMSDoc}
            docId={props.docId}
            onPublishingLockClick={canEdit ? onPublishingLockClick : undefined}
          />
        </div>
      )}
      <div className="DocEditor__statusBar__buttonGroup mr-2 flex">
        <div className="DocEditor__statusBar__search group/segment">
          <Tooltip label="⌘ + Shift + f">
            <Button
              className={STATUS_BAR_GROUP_BUTTON_CLASSES}
              aria-pressed={searchActive}
              icon={<IconSearch />}
              onClick={() => {
                window.dispatchEvent(new CustomEvent('root:toggle-search'));
              }}
            >
              <span className={STATUS_BAR_LABEL_CLASSES}>Search</span>
            </Button>
          </Tooltip>
        </div>
        {fieldComments && (
          <div className="DocEditor__statusBar__comments group/segment">
            <Button
              className={STATUS_BAR_GROUP_BUTTON_CLASSES}
              aria-pressed={commentsActive}
              icon={<IconMessageCircle />}
              onClick={() => {
                window.dispatchEvent(new CustomEvent(TOGGLE_COMMENTS_EVENT));
              }}
            >
              <span className={STATUS_BAR_LABEL_CLASSES}>Comments</span>
              {fieldComments.openCount > 0 && (
                <span className="DocEditor__statusBar__comments__count ml-1 md:ml-2.5 inline-block min-w-4.5 rounded-full bg-button-blue-hover px-1 py-1 text-center text-2xs font-semibold leading-none text-inverse">
                  {fieldComments.openCount}
                </span>
              )}
            </Button>
          </div>
        )}
        {(window.__ROOT_CTX.checks || []).length > 0 && (
          <div className="DocEditor__statusBar__checks group/segment">
            <Button
              className={STATUS_BAR_GROUP_BUTTON_CLASSES}
              aria-pressed={checksActive}
              icon={<IconListCheck />}
              onClick={() => {
                window.dispatchEvent(new CustomEvent('root:toggle-checks'));
              }}
            >
              <span className={STATUS_BAR_LABEL_CLASSES}>Checks</span>
            </Button>
          </div>
        )}
        {aiAvailable && (
          <div className="DocEditor__statusBar__ai group/segment">
            <Tooltip label="⌘ + i">
              <Button
                className={STATUS_BAR_GROUP_BUTTON_CLASSES}
                aria-pressed={aiActive}
                icon={<IconRobot />}
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('root:toggle-ai'));
                }}
              >
                <span className={STATUS_BAR_LABEL_CLASSES}>Root AI</span>
              </Button>
            </Tooltip>
          </div>
        )}
      </div>
      <div className="DocEditor__statusBar__i18n mr-2">
        <Button
          className="max-md:gap-0 max-md:px-1.5"
          icon={<IconPlanet />}
          onClick={() => {
            localizationModal.open({
              docId: props.docId,
              collection: props.collection,
              draft: draft.controller,
              locale: (query.locale as string) || undefined,
            });
          }}
        >
          <span className={STATUS_BAR_LABEL_CLASSES}>Localization</span>
        </Button>
      </div>
      <div className="DocEditor__statusBar__publishButton">
        {loading ? (
          <Button
            variant="primary"
            onClick={() => publishDocModal.open()}
            loading
            disabled
          >
            Publish
          </Button>
        ) : testIsScheduled(data as CMSDoc) ? (
          <Tooltip
            label={`Scheduled ${formatDateTime(data.sys!.scheduledAt!)} by ${
              data.sys!.scheduledBy
            }`}
          >
            <Button variant="primary" icon={<IconRocket />} disabled>
              Publish
            </Button>
          </Tooltip>
        ) : testPublishingLocked(data as CMSDoc) ? (
          <Tooltip label={getPublishingLockedLabel(data as CMSDoc)}>
            <Button variant="primary" icon={<IconLock />} disabled>
              Publish
            </Button>
          </Tooltip>
        ) : (
          <ConditionalTooltip
            label="You don't have access to publish this document"
            condition={!canPublish}
          >
            <Button
              variant="primary"
              icon={<IconRocket />}
              onClick={() => publishDocModal.open()}
              disabled={!canPublish}
            >
              Publish
            </Button>
          </ConditionalTooltip>
        )}
      </div>
      <div className="DocEditor__statusBar__actionsMenu ml-1">
        <DocActionsMenu
          docId={props.docId}
          data={data as CMSDoc}
          onAction={onDocAction}
        />
      </div>
    </div>
  );
};

/**
 * Joins the status bar's toggle buttons into one segmented group (square
 * inner corners, shared borders), with Mantine's blue "light" look for the
 * pressed (active) panel.
 */
const STATUS_BAR_GROUP_BUTTON_CLASSES =
  'DocEditor__statusBar__buttonGroup__button z-0 -ml-px rounded-none max-md:gap-0 max-md:px-1.5 group-first/segment:ml-0 group-first/segment:rounded-l-sm group-last/segment:rounded-r-sm ' +
  'aria-pressed:z-10 aria-pressed:border-info-line aria-pressed:bg-button-blue-soft aria-pressed:text-button-blue-hover aria-pressed:hover:bg-button-blue-soft';

/**
 * Hides a status bar button's label (but not from screen readers) below
 * `md`, where the bar shares the mobile header with the menu button. Its
 * button gets `max-md:gap-0 max-md:px-1.5` to stay square.
 */
const STATUS_BAR_LABEL_CLASSES = 'max-md:sr-only';

/**
 * Lets editors know that a scheduled publish uses the doc's content from when
 * it was scheduled, so edits made afterwards aren't included.
 */
DocEditor.ScheduledNotice = (props: {draft: DraftDocContext}) => {
  const [sys, setSys] = useState<CMSDoc['sys'] | null>(
    props.draft.controller.getData()?.sys || null
  );
  useDraftDocField('sys', (sys: CMSDoc['sys']) => setSys(sys));
  if (!sys || !testIsScheduled({sys} as CMSDoc)) {
    return null;
  }
  return (
    <div className="DocEditor__scheduledNotice flex items-start gap-2 text-pretty rounded-md border border-warning-line bg-warning-soft px-3 py-2.5">
      <IconAlarm
        size={16}
        className="DocEditor__scheduledNotice__icon mt-0.5 shrink-0"
      />
      <Text size="body-sm">
        Scheduled to publish {formatDateTime(sys.scheduledAt!)} by{' '}
        {sys.scheduledBy}. Edits made after scheduling won't be included in the
        scheduled publish. To include them, unschedule and schedule the doc
        again.
      </Text>
    </div>
  );
};

DocEditor.SaveState = () => {
  const [saveState, setSaveState] = useState<SaveState>(SaveState.NO_CHANGES);
  useDraftDocSaveState((saveState) => {
    setSaveState(saveState);
  });
  return (
    <div className="DocEditor__statusBar__saveState font-medium italic max-md:order-last max-md:ml-2 md:mr-4">
      {saveState === SaveState.SAVED && 'saved!'}
      {saveState === SaveState.SAVING && 'saving...'}
      {saveState === SaveState.UPDATES_PENDING && 'saving...'}
      {saveState === SaveState.ERROR && 'error saving'}
    </div>
  );
};

/**
 * Undo/redo buttons for the doc editor, including the document-level
 * keyboard shortcuts (⌘Z / ⌘⇧Z). Rendered in the DocumentPage side header
 * next to the save button.
 */
DocEditor.UndoRedoButtons = () => {
  const history = useDraftDocHistory();

  // The handler closes over the latest history state via a ref so the
  // document-level listener only binds once.
  const historyRef = useRef(history);
  historyRef.current = history;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Text inputs and contenteditable (Lexical) keep their own undo/redo;
      // the doc-level shortcut only fires outside of them.
      if (isEditableTarget(event.target)) {
        return;
      }
      // Ignore events from open modals (e.g. the reference editor modal,
      // which nests its own doc editor) so the main doc isn't undone while
      // a modal has focus.
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('[role="dialog"]')
      ) {
        return;
      }
      if (isUndoKeyEvent(event)) {
        event.preventDefault();
        event.stopPropagation();
        historyRef.current.undo();
      } else if (isRedoKeyEvent(event)) {
        event.preventDefault();
        event.stopPropagation();
        historyRef.current.redo();
      }
    };
    document.documentElement.addEventListener('keydown', onKeyDown);
    return () => {
      document.documentElement.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const undoLabel = history.undoLabel
    ? `Undo: ${history.undoLabel} (⌘ Z)`
    : 'Undo (⌘ Z)';
  const redoLabel = history.redoLabel
    ? `Redo: ${history.redoLabel} (⌘ ⇧ Z)`
    : 'Redo (⌘ ⇧ Z)';

  return (
    <div className="DocEditor__undoRedo mr-1 flex items-center">
      <IconButton
        className="DocEditor__undoRedo__button"
        label="Undo"
        tooltip={history.canUndo ? undoLabel : false}
        disabled={!history.canUndo}
        onClick={() => history.undo()}
      >
        <IconArrowBackUp />
      </IconButton>
      <IconButton
        className="DocEditor__undoRedo__button"
        label="Redo"
        tooltip={history.canRedo ? redoLabel : false}
        disabled={!history.canRedo}
        onClick={() => history.redo()}
      >
        <IconArrowForwardUp />
      </IconButton>
    </div>
  );
};

/**
 * Finds the closest rendered field element for an applied history deepkey.
 * Applied keys often target values without their own field div (array order
 * keys like `<deepKey>._array`, array item keys), so walk up the key path
 * until a rendered `.DocEditor__field` is found. The search is scoped to the
 * editor root so nested editors (e.g. the reference editor modal) never
 * match each other's fields.
 */
function resolveHistoryFieldElement(
  root: HTMLElement,
  deepKey: string
): HTMLElement | null {
  let key = deepKey;
  while (key && key !== 'fields') {
    const el = root.querySelector<HTMLElement>(`[id="${key}"]`);
    if (el && el.classList.contains('DocEditor__field')) {
      return el;
    }
    const index = key.lastIndexOf('.');
    if (index === -1) {
      return null;
    }
    key = key.slice(0, index);
  }
  return null;
}

/**
 * Headless component that gives the user a visual indicator of what an
 * undo/redo changed by deeplinking to the affected field: the existing
 * deeplink functionality highlights the field and scrolls it into view
 * (opening collapsed drawers along the way).
 */
DocEditor.HistoryDeeplink = (props: {rootRef: RefObject<HTMLDivElement>}) => {
  const deeplink = useDeeplink();
  const deeplinkRef = useRef(deeplink);
  deeplinkRef.current = deeplink;

  useDraftDocHistoryApplied((keys: string[]) => {
    // Wait a beat for the re-render triggered by the restore, so fields
    // recreated by the undo (e.g. a restored array item) are in the DOM.
    window.setTimeout(() => {
      const root = props.rootRef.current;
      if (!root) {
        return;
      }
      for (const key of keys) {
        const el = resolveHistoryFieldElement(root, key);
        if (el) {
          deeplinkRef.current.setValue(el.id);
          scrollToDeeplink(el, {behavior: 'smooth', force: true});
          return;
        }
      }
    }, 50);
  });

  return null;
};

/**
 * Returns the deep key of the field that owns the focused element. Focus is
 * attributed to the closest field that renders a field header, since that's
 * where other users see the presence indicator.
 */
function getFocusedFieldKey(
  root: HTMLElement,
  target: HTMLElement
): string | null {
  let innermostKey: string | null = null;
  let field = target.closest<HTMLElement>('.DocEditor__field');
  while (field && root.contains(field)) {
    const deepKey = field.id;
    if (deepKey) {
      if (!innermostKey) {
        innermostKey = deepKey;
      }
      const header = field.querySelector(
        `[data-field-header-for="${CSS.escape(deepKey)}"]`
      );
      if (header) {
        return deepKey;
      }
    }
    field =
      field.parentElement?.closest<HTMLElement>('.DocEditor__field') || null;
  }
  return innermostKey;
}

/**
 * Headless component that reports the field the current user is focused on
 * to the `ViewersProvider`, so other users can see which field is being
 * edited. Focus moving outside of the editor (e.g. into a modal or the
 * preview) keeps the last focused field.
 */
DocEditor.FocusTracker = (props: {rootRef: RefObject<HTMLDivElement>}) => {
  const controller = useViewersController();

  useEffect(() => {
    const root = props.rootRef.current;
    if (!controller || !root) {
      return;
    }
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) {
        return;
      }
      controller.setFocusedField(getFocusedFieldKey(root, target));
    };
    root.addEventListener('focusin', onFocusIn);
    return () => {
      root.removeEventListener('focusin', onFocusIn);
      controller.setFocusedField(null);
    };
  }, [controller]);

  return null;
};

DocEditor.Field = (props: FieldProps) => {
  if (props.field.showWhen) {
    return <DocEditor.ConditionalField {...props} />;
  }
  return renderVisibleField(props);
};

function renderVisibleField(props: FieldProps) {
  if (props.field.deprecated) {
    return <DocEditor.DeprecatedField {...props} />;
  }
  return <DocEditor.FieldBody {...props} />;
}

/** Renders a field only when its `showWhen` conditions match. */
DocEditor.ConditionalField = (props: FieldProps) => {
  const {controller} = useDraftDoc();
  const testVisible = () =>
    testShowWhen(props.field.showWhen, (path) =>
      controller.getValue(getSiblingDeepKey(props.deepKey, path))
    );
  const [visible, setVisible] = useState(testVisible);

  useEffect(() => {
    const conditions = toFieldConditions(props.field.showWhen);
    const unsubscribes = conditions.map((condition) =>
      controller.subscribe(
        getSiblingDeepKey(props.deepKey, condition.field),
        () => setVisible(testVisible())
      )
    );
    setVisible(testVisible());
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [controller, props.deepKey, props.field]);

  if (!visible) {
    return null;
  }
  return renderVisibleField(props);
};

/** Renders deprecated fields only when existing data still needs editing. */
DocEditor.DeprecatedField = (props: FieldProps) => {
  const [fieldValueEmpty, setFieldValueEmpty] = useState(true);
  const types = useCollectionSchemaTypes();

  useDraftDocField(props.deepKey, (newValue: any) => {
    setFieldValueEmpty(testFieldEmpty(props.field, newValue, types));
  });

  if (fieldValueEmpty) {
    return null;
  }

  return <DocEditor.FieldBody {...props} />;
};

/** Renders a field after visibility checks have already passed. */
DocEditor.FieldBody = (props: FieldProps) => {
  const field = props.field;
  const level = props.level ?? 0;
  const deeplink = useDeeplink();
  const targeted = deeplink.value === props.deepKey;
  const ref = useRef<HTMLDivElement>(null);
  const localizable = useMemo(
    () => testLocalizedValuesEnabled(field, props.deepKey, props.isArrayChild),
    [field, props.deepKey, props.isArrayChild]
  );
  const types = useCollectionSchemaTypes();
  const [pendingLocales, setPendingLocales] = useState<string[]>([]);
  const localizedValues: LocalizedValuesFieldProps | undefined = localizable
    ? {
        field,
        deepKey: props.deepKey,
        types,
        pendingLocales,
        setPendingLocales,
      }
    : undefined;

  const showFieldHeader = useMemo(() => {
    if (field.type === 'object') {
      // Default to the "drawer" variant.
      const variant = field.variant || 'drawer';
      if (variant === 'drawer') {
        return false;
      }
    }
    return !props.hideHeader && !field.hideLabel;
  }, [props.hideHeader, field]);

  useEffect(() => {
    if (targeted) {
      scrollToDeeplink(ref.current!);
    }
  }, [targeted]);

  const input =
    field.type === 'array' ? (
      <DocEditor.ArrayField {...props} />
    ) : field.type === 'boolean' ? (
      <BooleanField {...props} />
    ) : field.type === 'date' ? (
      <DateField {...props} />
    ) : field.type === 'datetime' ? (
      <DateTimeField {...props} />
    ) : field.type === 'file' ? (
      <FileField {...props} />
    ) : field.type === 'image' ? (
      <ImageField {...props} />
    ) : field.type === 'multiselect' ? (
      <MultiSelectField {...props} />
    ) : field.type === 'number' ? (
      <NumberField {...props} />
    ) : field.type === 'object' ? (
      <DocEditor.ObjectField {...props} />
    ) : field.type === 'oneof' ? (
      <DocEditor.OneOfField {...props} />
    ) : field.type === 'password' ? (
      <PasswordField {...props} />
    ) : field.type === 'reference' ? (
      <ReferenceField {...props} />
    ) : field.type === 'references' ? (
      <ReferencesField {...props} />
    ) : field.type === 'richtext' ? (
      <RichTextField {...props} />
    ) : field.type === 'select' ? (
      <SelectField {...props} />
    ) : field.type === 'string' ? (
      <StringField {...props} />
    ) : (
      <div className="DocEditor__field__input__unknown">
        Unknown field type: {(field as any).type}
      </div>
    );

  return (
    <div
      className={cn(
        'DocEditor__field',
        field.deprecated && 'DocEditor__field--deprecated opacity-50',
        targeted &&
          'DocEditor__field--deeplinked rounded-sm border border-warning-line bg-warning-soft p-4'
      )}
      data-type={field.type}
      data-level={level}
      id={props.deepKey}
      ref={ref}
    >
      {showFieldHeader && (
        <DocEditor.FieldHeader
          {...props}
          className={
            // Inline objects at the top level read as a band across the
            // field column.
            field.type === 'object' && level === 0
              ? '-mx-3 mt-3 border-0 border-y border-solid border-border px-3 py-1'
              : undefined
          }
          localizedValues={localizedValues}
        />
      )}
      <div className="DocEditor__field__input">
        <FieldErrorBoundary deepKey={props.deepKey}>
          {localizedValues ? (
            <DocEditor.LocalizedValues {...localizedValues} level={level}>
              {input}
            </DocEditor.LocalizedValues>
          ) : (
            input
          )}
        </FieldErrorBoundary>
      </div>
    </div>
  );
};

interface DocEditorLocalizedValuesProps extends LocalizedValuesFieldProps {
  level: number;
  children: ComponentChildren;
}

/** Renders the field's default value editor and its localized values. */
DocEditor.LocalizedValues = (props: DocEditorLocalizedValuesProps) => {
  const {level, ...rest} = props;
  return (
    <LocalizedValues
      {...rest}
      renderField={(deepKey) => (
        <DocEditor.FieldBody
          field={props.field}
          deepKey={deepKey}
          level={level}
          hideHeader
        />
      )}
    />
  );
};

interface FieldHeaderProps extends FieldProps {
  className?: string;
  /** Shows the localized values button, see `DocEditor.LocalizedValues`. */
  localizedValues?: LocalizedValuesFieldProps;
}

DocEditor.FieldHeader = (props: FieldHeaderProps) => {
  const field = props.field;
  const label = field.label || field.id;

  const deeplink = useDeeplink();
  const deeplinkUrl = useMemo(
    () => buildDeeplinkUrl(props.deepKey || ''),
    [props.deepKey]
  );
  const fieldViewers = useFieldViewers(props.deepKey);

  return (
    <div
      className={cn(
        'DocEditor__FieldHeader group/header relative mb-2',
        fieldViewers.length > 0 && 'DocEditor__FieldHeader--hasViewers',
        props.localizedValues && 'DocEditor__FieldHeader--localizable',
        // Leaves room for the absolutely positioned actions.
        fieldViewers.length > 0
          ? props.localizedValues
            ? 'pr-34.5'
            : 'pr-29'
          : props.localizedValues
            ? 'pr-19.5'
            : 'pr-14',
        props.className
      )}
      data-field-header-for={props.deepKey}
    >
      {field.deprecated ? (
        <div className="DocEditor__FieldHeader__label flex gap-2 font-semibold">
          DEPRECATED: {label}
        </div>
      ) : (
        <div className="DocEditor__FieldHeader__label group/label flex gap-2 font-semibold">
          <span>{label}</span>
          {props.deepKey && (
            <a
              className="DocEditor__FieldHeader__label__deeplink text-border-strong no-underline underline-offset-2 opacity-0 transition-opacity duration-300 hover:underline group-hover/label:opacity-100 group-focus-within/label:opacity-100"
              href={deeplinkUrl}
              tabIndex={-1}
              title="Link to field"
              onClick={(e) => {
                e.preventDefault();
                deeplink.setUrlValue(props.deepKey!);
              }}
            >
              #
            </a>
          )}
        </div>
      )}
      {field.help && (
        <div className="DocEditor__FieldHeader__help mt-0.5 font-normal">
          {field.help}
        </div>
      )}
      <div className="DocEditor__FieldHeader__actions absolute right-0 top-0 flex items-center gap-1">
        {fieldViewers.length > 0 && (
          <UserAvatarGroup
            className="DocEditor__FieldHeader__viewers mr-0.5 *:-ml-1.5 *:first:ml-0"
            emails={fieldViewers.map((viewer) => viewer.email)}
            size={20}
            max={3}
          />
        )}
        <DocEditor.FieldHeaderCommentActionIcon
          field={field}
          deepKey={props.deepKey}
        />
        {props.localizedValues && (
          <LocalizedValuesButton {...props.localizedValues} />
        )}
        <DocEditor.FieldHeaderTranslationsActionIcon
          field={field}
          deepKey={props.deepKey}
        />
      </div>
    </div>
  );
};

interface FieldHeaderCommentActionIconProps {
  field: schema.Field;
  deepKey: string;
}

/**
 * Comment button in the field header. Shows the number of open comments on
 * the field's thread and opens a popover with the thread. Only rendered when
 * a `FieldCommentsProvider` is available (i.e. on the document page).
 */
DocEditor.FieldHeaderCommentActionIcon = (
  props: FieldHeaderCommentActionIconProps
) => {
  const comments = useFieldComments();
  // Comments go on an object's child fields rather than the object itself.
  if (!comments || !props.deepKey || props.field.type === 'object') {
    return null;
  }
  return <DocEditor.FieldHeaderCommentActionIconInner {...props} />;
};

/** Inner component that only mounts when field comments are available. */
DocEditor.FieldHeaderCommentActionIconInner = (
  props: FieldHeaderCommentActionIconProps
) => {
  const comments = useFieldComments()!;
  const thread = useFieldCommentThread(props.deepKey);
  const resolvedThreads = useFieldResolvedThreads(props.deepKey);
  const draft = useDraftDoc();
  const collection = useDocCollectionSchema();
  const pinnedThreads = usePinnedCommentThreads();
  const [opened, setOpened] = useState(false);
  const isDesktop = useMediaQuery('(width >= 48rem)');
  const popoverRef = useRef<HTMLDivElement>(null);
  const count = thread ? countThreadComments(thread) : 0;
  const pinned = Boolean(
    pinnedThreads?.isPinned(comments.docId, props.deepKey)
  );
  // A field whose threads are all resolved is treated like a field with no
  // comments; its resolved threads are reachable from inside the popover.
  const canOpen = Boolean(thread) || comments.canComment;

  // The label depends on the doc value (array positions, one-of types), so
  // it's recomputed each time the popover opens.
  const fieldLabel = useMemo(
    () =>
      formatFieldPath(collection, props.deepKey, (deepKey) =>
        draft.controller?.getValue(deepKey)
      ),
    [collection, props.deepKey, draft.controller, opened]
  );

  if (!canOpen) {
    return null;
  }

  const label = thread
    ? `${count} comment${count === 1 ? '' : 's'}`
    : 'Add comment';

  // Moves the thread into a floating window that stays in place while the
  // user edits and navigates around the CMS. The window starts where the
  // popover was, offset by the window's padding and title bar.
  const pinThread = () => {
    if (!pinnedThreads) {
      return;
    }
    const rect = popoverRef.current?.getBoundingClientRect();
    const position = clampPinnedWindowPosition(
      (rect?.left ?? window.innerWidth / 2) - 12,
      (rect?.top ?? window.innerHeight / 3) - 42
    );
    pinnedThreads.pin({
      docId: comments.docId,
      fieldKey: props.deepKey,
      fieldLabel,
      ...position,
    });
    setOpened(false);
  };

  return (
    <Popover
      open={opened}
      onOpenChange={(open) => {
        // A pinned thread already has a window; bring it forward instead.
        if (open && pinned) {
          pinnedThreads!.focus(comments.docId, props.deepKey);
          return;
        }
        setOpened(open);
      }}
      // Beside the field on desktop; below it on phones, where there's no
      // room to the side.
      placement={isDesktop ? 'left-start' : 'bottom-end'}
      width={420}
      withArrow
      trapFocus={false}
      closeOnOutsideClick={false}
      label={`Comments on ${fieldLabel}`}
      className="DocEditor__FieldHeader__comments"
      trigger={
        <Tooltip label={label}>
          <button
            type="button"
            className={cn(
              'DocEditor__FieldHeader__comments__button',
              thread && 'DocEditor__FieldHeader__comments__button--hasThread',
              thread && 'DocEditor__FieldHeader__comments__button--open',
              (opened || pinned) &&
                'DocEditor__FieldHeader__comments__button--active',
              'm-0 inline-flex h-4.5 min-w-4.5 cursor-pointer appearance-none items-center justify-center gap-0.5 rounded-sm border-0 bg-transparent px-0.5 text-muted opacity-35 transition duration-200',
              'hover:bg-surface-hover hover:text-fg focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-focus group-hover/header:opacity-100 group-focus-within/header:opacity-100',
              thread && 'opacity-100',
              (opened || pinned) && 'bg-surface-hover text-fg opacity-100'
            )}
            aria-label={label}
            onClick={(e: MouseEvent) => {
              // The header may live inside a <summary>; keep the click from
              // toggling the drawer. The popover toggles itself.
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <IconMessageCircle size={14} strokeWidth="1.8" />
            {thread && count > 0 && (
              <span className="DocEditor__FieldHeader__comments__count text-2xs font-semibold leading-none">
                {count}
              </span>
            )}
          </button>
        </Tooltip>
      }
    >
      <div
        ref={popoverRef}
        className="DocEditor__FieldHeader__comments__popover"
        onClick={(e: MouseEvent) => e.stopPropagation()}
      >
        <CommentThread
          docId={comments.docId}
          fieldKey={props.deepKey}
          fieldLabel={fieldLabel}
          thread={thread}
          resolvedCount={resolvedThreads.length}
          autoFocus
          headerActions={
            <>
              {pinnedThreads && (
                <IconButton size="xs" label="Pin to screen" onClick={pinThread}>
                  <IconPin strokeWidth="1.8" />
                </IconButton>
              )}
              <IconButton
                size="xs"
                label="Open in comments panel"
                onClick={() => {
                  setOpened(false);
                  openFieldCommentsPanel({
                    fieldKey: props.deepKey,
                    fieldLabel,
                  });
                }}
              >
                <IconLayoutSidebarRight strokeWidth="1.8" />
              </IconButton>
              <IconButton
                size="xs"
                label="Close"
                onClick={() => setOpened(false)}
              >
                <IconX strokeWidth="1.8" />
              </IconButton>
            </>
          }
        />
      </div>
    </Popover>
  );
};

interface FieldHeaderTranslationsActionIconProps {
  field: schema.Field;
  deepKey: string;
}

DocEditor.FieldHeaderTranslationsActionIcon = (
  props: FieldHeaderTranslationsActionIconProps
) => {
  const field = props.field;
  const translate: boolean = Boolean((field as any).translate);
  const i18nConfig = window.__ROOT_CTX.rootConfig.i18n || {};
  const i18nLocales = i18nConfig.locales || ['en'];

  // Early return before heavy hooks when translations aren't applicable.
  if (!translate || i18nLocales.length <= 1) {
    return null;
  }

  return <DocEditor.FieldHeaderTranslationsActionIconInner {...props} />;
};

/** Inner component that only mounts when translations are applicable. */
DocEditor.FieldHeaderTranslationsActionIconInner = (
  props: FieldHeaderTranslationsActionIconProps
) => {
  const field = props.field;
  const editTranslationsModal = useEditTranslationsModal();
  const draft = useDraftDoc();
  const [value, setValue] = useState<any>(() =>
    draft.controller.getValue(props.deepKey)
  );

  useDraftDocField(props.deepKey, (value: any) => {
    setValue(value);
  });

  const types = useCollectionSchemaTypes();
  const actionIconDisabled = useMemo(
    () => testFieldEmpty(field, value, types),
    [field, types, value]
  );

  const [doNotTranslate, setDoNotTranslate] = useState(false);

  useEffect(() => {
    if (!props.deepKey || !draft.controller) {
      return;
    }
    const metadataKey = getMetadataKey(props.deepKey);
    const unsubscribe = draft.controller.subscribe(
      metadataKey,
      (metadata: any) => {
        setDoNotTranslate(metadata?.translate === false);
      }
    );
    return unsubscribe;
  }, [props.deepKey, draft.controller]);

  const openTranslations = () => {
    const docData = draft.controller.getData();
    if (!docData) {
      return;
    }
    const strings = new Set<string>();
    extractField(strings, field, value, types);
    editTranslationsModal.open({
      docId: draft.controller.docId,
      strings: Array.from(strings),
      l10nSheet: docData?.sys?.l10nSheet,
      field: {
        id: field.id || props.deepKey,
        deepKey: props.deepKey,
      },
      draft: draft,
    });
  };

  return (
    <div className="DocEditor__FieldHeader__translate flex">
      {doNotTranslate || !actionIconDisabled ? (
        <IconButton
          size="xs"
          label={
            doNotTranslate ? 'Translations are disabled' : 'Show translations'
          }
          onClick={openTranslations}
        >
          {doNotTranslate ? <IconLanguageOff /> : <IconLanguage />}
        </IconButton>
      ) : (
        <div className="DocEditor__FieldHeader__translate__iconDisabled pointer-events-none inline-flex size-control-xs items-center justify-center opacity-20">
          <IconLanguage size={14} />
        </div>
      )}
    </div>
  );
};

DocEditor.ObjectField = (props: FieldProps) => {
  const field = props.field as schema.ObjectField;
  // Default to the "drawer" variant.
  let variant = field.variant;
  if (!variant) {
    if (props.isArrayChild) {
      variant = 'inline';
    } else {
      variant = 'drawer';
    }
  }
  if (variant === 'drawer') {
    return <DocEditor.ObjectFieldDrawer {...props} />;
  }
  // Inline variant, used by the ArrayField.
  return (
    <div className="DocEditor__ObjectField">
      <div
        className={cn(
          'DocEditor__ObjectField__fields',
          // Nested inline objects show their nesting with an accent rule.
          (props.level ?? 0) > 0 &&
            'border-0 border-l-2 border-solid border-accent pl-3'
        )}
      >
        {field.fields.map((field) => (
          <DocEditor.Field
            key={field.id}
            field={field}
            deepKey={`${props.deepKey}.${field.id}`}
          />
        ))}
      </div>
    </div>
  );
};

DocEditor.ObjectFieldDrawer = (props: FieldProps) => {
  const field = props.field as schema.ObjectField;
  const collapsed = field.drawerOptions?.collapsed || false;
  const inline = field.drawerOptions?.inline || false;
  const draft = useDraftDoc().controller;
  const virtualClipboard = useVirtualClipboard();
  const editJsonModal = useEditJsonModal();
  const modals = useModals();

  const deeplink = useDeeplink();
  const initialOpen = !collapsed || deeplink.value.includes(props.deepKey);

  const copyToClipboard = () => {
    const data = draft.getValue(props.deepKey) || {};
    virtualClipboard.set(data);
    showNotification({
      message: 'Copied to clipboard',
      autoClose: 2000,
    });
  };

  const pasteFromClipboard = async () => {
    const data = await virtualClipboard.get();
    if (!data || typeof data !== 'object') {
      showNotification({
        message: 'Clipboard empty (nothing to paste)',
        color: 'red',
        autoClose: 2000,
      });
      return;
    }
    draft.updateKey(props.deepKey, data);
    showNotification({
      message: 'Pasted from clipboard',
      autoClose: 2000,
    });
  };

  const clearValue = async (modalId?: string) => {
    draft.history.group('Cleared section', () => {
      draft.removeKey(props.deepKey);
    });
    showUndoNotification(draft, 'Section cleared');
    // Clear is destructive, so persist immediately instead of waiting for
    // autosave. Undoing afterwards re-queues the restored values through the
    // normal save flow.
    await draft.flush();
    if (modalId) {
      modals.closeModal(modalId);
    }
  };

  const confirmClear = () => {
    const label = field.label || field.id || 'drawer';
    const modalId = modals.openConfirmModal({
      title: `Clear ${label}?`,
      children: (
        <Text
          size="body-sm"
          weight="semi-bold"
          className="DocEditor__ObjectFieldDrawer__confirmText text-pretty"
        >
          This will clear all values in this section. You can undo this with ⌘Z.
        </Text>
      ),
      labels: {confirm: 'Clear', cancel: 'Cancel'},
      cancelProps: {size: 'xs'},
      confirmProps: {color: 'red', size: 'xs'},
      closeOnConfirm: false,
      onConfirm: () => clearValue(modalId),
    });
  };

  const editJson = () => {
    const data = draft.getValue(props.deepKey) || {};
    editJsonModal.open({
      data: data,
      onSave: (newValue) => {
        draft.updateKey(props.deepKey, newValue);
        editJsonModal.close();
      },
    });
  };

  return (
    <div
      className={cn(
        'DocEditor__ObjectFieldDrawer',
        inline && 'DocEditor__ObjectFieldDrawer--inline'
      )}
    >
      <details
        className="DocEditor__ObjectFieldDrawer__drawer"
        open={initialOpen}
      >
        <summary
          className={cn(
            'DocEditor__ObjectFieldDrawer__drawer__toggle flex cursor-pointer select-none items-center gap-2 px-4 py-2 transition-colors duration-300 hover:bg-surface-hover',
            inline ? 'border-0' : 'border-0 border-y border-solid border-border'
          )}
        >
          <div className="DocEditor__ObjectFieldDrawer__drawer__toggle__icon flex shrink-0 transition-transform duration-300">
            <IconChevronRight size={16} />
          </div>
          <DocEditor.FieldHeader
            className="DocEditor__ObjectFieldDrawer__drawer__toggle__header mb-0 min-w-0 flex-1"
            field={field}
            deepKey={props.deepKey}
          />
          <Menu
            className="DocEditor__ObjectFieldDrawer__drawer__menu"
            placement="bottom"
            trigger={
              <IconButton
                className="DocEditor__ObjectFieldDrawer__drawer__menu__dots mr-1"
                size="xs"
                label="More actions"
                onClick={(e: MouseEvent) => {
                  // Keep the click from toggling the drawer.
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onKeyDown={stopArrowKeys}
              >
                <IconDotsVertical />
              </IconButton>
            }
          >
            <MenuGroup label="CLIPBOARD">
              <MenuItem
                className="DocEditor__ObjectFieldDrawer__drawer__menu__item"
                icon={<IconClipboardCopy />}
                onClick={copyToClipboard}
              >
                Copy
              </MenuItem>
              <MenuItem
                className="DocEditor__ObjectFieldDrawer__drawer__menu__item"
                icon={<IconClipboard />}
                onClick={pasteFromClipboard}
              >
                Paste
              </MenuItem>
            </MenuGroup>
            <MenuGroup label="CODE">
              <MenuItem
                className="DocEditor__ObjectFieldDrawer__drawer__menu__item"
                icon={<IconBraces />}
                onClick={editJson}
              >
                Edit JSON
              </MenuItem>
            </MenuGroup>
            <MenuGroup label="ACTIONS">
              <MenuItem
                className="DocEditor__ObjectFieldDrawer__drawer__menu__item"
                icon={<IconTrash />}
                onClick={confirmClear}
              >
                Clear
              </MenuItem>
            </MenuGroup>
          </Menu>
        </summary>
        <div
          className={cn(
            'DocEditor__ObjectFieldDrawer__drawer__content DocEditor__ObjectFieldDrawer__fields p-4',
            inline && 'pl-12'
          )}
        >
          {field.fields.map((field) => (
            <DocEditor.Field
              key={field.id}
              field={field}
              deepKey={`${props.deepKey}.${field.id}`}
            />
          ))}
        </div>
      </details>
    </div>
  );
};

/**
 * Keeps the arrow keys pressed on a menu button inside a `<summary>` from
 * reaching the summary's own handlers (e.g. moving an array item). The menu
 * still opens on ArrowUp and ArrowDown.
 */
function stopArrowKeys(e: KeyboardEvent) {
  if (e.key.startsWith('Arrow')) {
    e.stopPropagation();
  }
}

interface ArrayFieldValue {
  [key: string]: any;
  _array: string[];
  /** Tracks the last-moved array item. */
  _moved?: string;
  /** Tracks the last-pasted array item. */
  _pasted?: string;
  _new?: string[];
}

type ArrayItemValue = Record<string, any>;

interface ArrayUpdate {
  type: 'update';
  newValue: ArrayFieldValue;
}

interface ArrayUpdateItem {
  type: 'updateItem';
  index: number;
  newValue: ArrayItemValue;
  draft: DraftDocController;
  deepKey: string;
}

interface ArrayAdd {
  type: 'add';
  draft: DraftDocController;
  deepKey: string;
  defaultValue: ArrayItemValue;
}

interface ArrayInsertBefore {
  type: 'insertBefore';
  index: number;
  draft: DraftDocController;
  deepKey: string;
  defaultValue: ArrayItemValue;
}

interface ArrayInsertAfter {
  type: 'insertAfter';
  index: number;
  draft: DraftDocController;
  deepKey: string;
  defaultValue: ArrayItemValue;
}

interface ArrayDuplicate {
  type: 'duplicate';
  index: number;
  draft: DraftDocController;
  deepKey: string;
  value: ArrayItemValue;
}

interface ArrayMoveUp {
  type: 'moveUp';
  index: number;
  draft: DraftDocController;
  deepKey: string;
}

interface ArrayMoveDown {
  type: 'moveDown';
  index: number;
  draft: DraftDocController;
  deepKey: string;
}

interface ArrayMoveTo {
  type: 'moveTo';
  fromIndex: number;
  toIndex: number;
  draft: DraftDocController;
  deepKey: string;
}

interface ArrayRemoveAt {
  type: 'removeAt';
  index: number;
  draft: DraftDocController;
  deepKey: string;
}

interface ArrayPasteAfter {
  type: 'pasteAfter';
  index: number;
  draft: DraftDocController;
  deepKey: string;
  data: ClipboardData;
}

interface ArrayPasteBefore {
  type: 'pasteBefore';
  index: number;
  draft: DraftDocController;
  deepKey: string;
  data: ClipboardData;
}

type ArrayAction =
  | ArrayAdd
  | ArrayDuplicate
  | ArrayInsertAfter
  | ArrayInsertBefore
  | ArrayMoveDown
  | ArrayMoveUp
  | ArrayMoveTo
  | ArrayPasteAfter
  | ArrayPasteBefore
  | ArrayRemoveAt
  | ArrayUpdate
  | ArrayUpdateItem;

function arrayReducer(state: ArrayFieldValue, action: ArrayAction) {
  switch (action.type) {
    case 'update': {
      const newlyAdded = state._new || [];
      return {...action.newValue, _new: newlyAdded};
    }
    case 'updateItem': {
      const data = state ?? {};
      const order = [...(data._array || [])];
      const key = order[action.index];
      if (!key) {
        // The item no longer exists (e.g. removed by a concurrent update
        // before the dispatch landed). Writing would target a bogus
        // `undefined` key.
        console.error('updateItem: no item at index', action.index);
        return state;
      }
      const newValue = action.newValue ?? {};
      action.draft.updateKey(`${action.deepKey}.${key}`, newValue);
      return {
        ...data,
        [key]: newValue,
      };
    }
    case 'add': {
      const data = state ?? {};
      const newKey = autokey();
      const defaultValue = structuredClone(action.defaultValue || {});
      const order = [...(data._array || []), newKey];
      action.draft.updateKeys({
        [`${action.deepKey}._array`]: order,
        [`${action.deepKey}.${newKey}`]: defaultValue,
      });
      const newlyAdded = state._new || [];
      return {
        ...data,
        [newKey]: defaultValue,
        _array: order,
        _new: [...newlyAdded, newKey],
      };
    }
    case 'insertBefore': {
      const data = state ?? {};
      const order = [...(data._array || [])];
      const newKey = autokey();
      const defaultValue = structuredClone(action.defaultValue || {});
      order.splice(action.index, 0, newKey);
      action.draft.updateKeys({
        [`${action.deepKey}._array`]: order,
        [`${action.deepKey}.${newKey}`]: defaultValue,
      });
      const newlyAdded = state._new || [];
      return {
        ...data,
        [newKey]: defaultValue,
        _array: order,
        _new: [...newlyAdded, newKey],
      };
    }
    case 'insertAfter': {
      const data = state ?? {};
      const order = [...(data._array || [])];
      const newKey = autokey();
      const defaultValue = structuredClone(action.defaultValue || {});
      order.splice(action.index + 1, 0, newKey);
      action.draft.updateKeys({
        [`${action.deepKey}._array`]: order,
        [`${action.deepKey}.${newKey}`]: defaultValue,
      });
      const newlyAdded = state._new || [];
      return {
        ...data,
        [newKey]: defaultValue,
        _array: order,
        _new: [...newlyAdded, newKey],
      };
    }
    case 'duplicate': {
      const data = state ?? {};
      const order = [...(data._array || [])];
      const newKey = autokey();
      const clonedValue = structuredClone(action.value);
      order.splice(action.index + 1, 0, newKey);
      action.draft.updateKeys({
        [`${action.deepKey}._array`]: order,
        [`${action.deepKey}.${newKey}`]: clonedValue,
      });
      const newlyAdded = state._new || [];
      return {
        ...data,
        [newKey]: clonedValue,
        _array: order,
        _new: [...newlyAdded, newKey],
      };
    }
    case 'moveUp': {
      const data = state ?? {};
      const order = [...(data._array || [])];
      // Bounds-check against the current state; a stale index (e.g. from a
      // dispatch racing a concurrent update) would otherwise make arraySwap()
      // write `undefined` entries into `_array`.
      if (action.index <= 0 || action.index >= order.length) {
        return state;
      }
      arraySwap(order, action.index, action.index - 1);
      action.draft.updateKeys({
        [`${action.deepKey}._array`]: order,
      });
      return {
        ...data,
        _array: order,
        _moved: order[action.index - 1],
      };
    }
    case 'moveDown': {
      const data = state ?? {};
      const order = [...(data._array || [])];
      if (action.index < 0 || action.index >= order.length - 1) {
        return state;
      }
      arraySwap(order, action.index, action.index + 1);
      action.draft.updateKeys({
        [`${action.deepKey}._array`]: order,
      });
      return {
        ...data,
        _array: order,
        _moved: order[action.index + 1],
      };
    }
    case 'moveTo': {
      const data = state ?? {};
      const order = [...(data._array || [])];
      if (
        action.fromIndex < 0 ||
        action.fromIndex >= order.length ||
        action.toIndex < 0 ||
        action.toIndex >= order.length
      ) {
        console.error('Invalid moveTo index', action);
        return state;
      }
      const itemKey = order[action.fromIndex];
      arrayMove(order, action.fromIndex, action.toIndex);
      action.draft.updateKeys({
        [`${action.deepKey}._array`]: order,
      });
      return {
        ...data,
        _array: order,
        _moved: itemKey,
      };
    }
    case 'removeAt': {
      const data = {...(state ?? {})};
      const order = data._array || [];
      const newOrder = [...order];
      const oldKey = newOrder[action.index];
      if (!oldKey) {
        console.error('removeAt: no item at index', action.index);
        return state;
      }
      delete data[oldKey];
      newOrder.splice(action.index, 1);
      // A single updateKeys() call so the removal (order + item data) is
      // captured as one undoable history entry. `undefined` values map to
      // deleteField() in the db and delete the key from the local store.
      action.draft.updateKeys({
        [`${action.deepKey}._array`]: newOrder,
        [`${action.deepKey}.${oldKey}`]: undefined,
      });
      return {
        ...data,
        _array: newOrder,
      };
    }
    case 'pasteAfter': {
      const data = state ?? {};
      const order = [...(data._array || [])];
      const newKey = autokey();
      const newData = action.data;
      if (!newData) {
        showNotification({
          title: 'Skipped',
          message: 'Nothing to paste.',
          autoClose: true,
        });
        return state;
      }
      order.splice(action.index + 1, 0, newKey);
      action.draft.updateKeys({
        [`${action.deepKey}._array`]: order,
        [`${action.deepKey}.${newKey}`]: newData,
      });
      // Don't add to `_new` so that the item is collapsed by default.
      const newlyAdded = state._new || [];
      return {
        ...data,
        [newKey]: newData,
        _array: order,
        _new: newlyAdded,
        _pasted: newKey,
      };
    }
    case 'pasteBefore': {
      const data = state ?? {};
      const order = [...(data._array || [])];
      const newKey = autokey();
      const newData = action.data;
      if (!newData) {
        showNotification({
          title: 'Skipped',
          message: 'Nothing to paste.',
          autoClose: true,
        });
        return state;
      }
      order.splice(action.index, 0, newKey);
      action.draft.updateKeys({
        [`${action.deepKey}._array`]: order,
        [`${action.deepKey}.${newKey}`]: newData,
      });
      // Don't add to `_new` so that the item is collapsed by default.
      const newlyAdded = state._new || [];
      return {
        ...data,
        [newKey]: newData,
        _array: order,
        _new: newlyAdded,
        _pasted: newKey,
      };
    }
    default: {
      console.error('unknown action', action);
      return state;
    }
  }
}

DocEditor.ArrayField = (props: FieldProps) => {
  const draft = useDraftDoc().controller;
  const field = props.field as schema.ArrayField;
  const [value, dispatch] = useReducer(arrayReducer, {_array: []});
  const deeplink = useDeeplink();
  const virtualClipboard = useVirtualClipboard();

  const data = value ?? {};
  const order = data._array || [];

  // Keep track of newly-added keys, which should start in the "open" state.
  const newlyAdded = value._new || [];
  const [cutIndex, setCutIndex] = useState<number | null>(null);

  useDraftDocField(props.deepKey, (newValue: ArrayFieldValue) => {
    dispatch({type: 'update', newValue});
  });

  // Undo/redo restores write child keys (e.g. `<deepKey>._array`) directly,
  // which does not notify this component's plain subscription on the parent
  // key, so re-pull the array value whenever a history entry touches this
  // field's subtree.
  useDraftDocHistoryApplied((keys: string[]) => {
    const prefix = `${props.deepKey}.`;
    if (keys.some((key) => key === props.deepKey || key.startsWith(prefix))) {
      dispatch({type: 'update', newValue: draft.getValue(props.deepKey)});
    }
  });

  // Focus the field that was just moved or pasted.
  useEffect(() => {
    if (value._moved) {
      focusFieldHeader(props.deepKey, order.indexOf(value._moved));
    } else if (value._pasted) {
      focusFieldHeader(props.deepKey, order.indexOf(value._pasted));
    }
  }, [value]);

  /** Returns the array item's field value from the draft controller. */
  const getItemValue = (index: number) => {
    const key = order[index];
    const itemKey = `${props.deepKey}.${key}`;
    return draft.getValue(itemKey) || {};
  };

  // Firestore refuses to store a field nested more than 20 levels deep, and an
  // array costs two of them per item: one for the item's key in the stored
  // ArrayObject, and one for the item's own fields (array items are always
  // object-like). Adding an item that can't be saved would silently lose the
  // editor's work, so cap it here and warn while there's still room to
  // restructure the content.
  const LEVELS_PER_ARRAY_ITEM = 2;
  const remainingDepth = getRemainingNestingDepth(props.deepKey);
  const canAddItem = remainingDepth >= LEVELS_PER_ARRAY_ITEM;
  const itemHeadroom = remainingDepth - LEVELS_PER_ARRAY_ITEM;
  const nestingLimitMessage = `Firestore cannot save fields nested more than ${FIRESTORE_MAX_NESTING_DEPTH} levels deep. Flatten the content, or split it into a separate doc and use a reference field.`;
  const nestingWarning = !canAddItem
    ? `Items can't be added here. ${nestingLimitMessage}`
    : itemHeadroom <= NESTING_DEPTH_WARNING_BUFFER
      ? `Items added here have room for ${itemHeadroom} more ${
          itemHeadroom === 1 ? 'level' : 'levels'
        } of nesting. ${nestingLimitMessage}`
      : '';

  const maxItems = field.maxItems;
  const maxItemsReached =
    typeof maxItems === 'number' && order.length >= maxItems;
  const maxItemsMessage = `This field accepts at most ${maxItems} ${
    maxItems === 1 ? 'item' : 'items'
  }. Remove an item before adding another.`;

  /**
   * Blocks item creation once the array has bottomed out on nesting depth or
   * reached its `maxItems` limit. Moves (cut+paste) don't change the item
   * count, so they skip the `maxItems` check.
   */
  const testCanAddItem = (options?: {isMove?: boolean}) => {
    if (!canAddItem) {
      showNotification({
        title: 'Nesting limit reached',
        message: nestingWarning,
        color: 'red',
        autoClose: false,
      });
      return false;
    }
    if (maxItemsReached && !options?.isMove) {
      showNotification({
        title: 'Item limit reached',
        message: maxItemsMessage,
        color: 'red',
      });
      return false;
    }
    return true;
  };

  /** Reason the "add" actions are disabled, if any. */
  const addDisabledReason = !canAddItem
    ? nestingWarning
    : maxItemsReached
      ? maxItemsMessage
      : '';

  // For arrays of oneOf fields using the "picker" variant, adding an item
  // opens the component picker first and the item is created with the
  // selected type. Skipped when `itemDefault` already sets a `_type`.
  const collectionTypes = useCollectionSchemaTypes();
  const componentPickerModal = useComponentPickerModal();
  const usePickerOnAdd =
    field.of?.type === 'oneof' &&
    getOneOfVariant(field.of as schema.OneOfField) === 'picker' &&
    !field.itemDefault?._type;

  /**
   * Resolves the default value for a new item, then calls `callback` with it.
   * When the picker is enabled, the callback only fires once a type has been
   * selected (dismissing the picker adds nothing).
   */
  const withNewItemValue = (
    callback: (defaultValue: Record<string, any>) => void
  ) => {
    if (!usePickerOnAdd) {
      callback(field.itemDefault || {});
      return;
    }
    const {typesMap, orderedSchemas} = resolveOneOfTypes(
      field.of as schema.OneOfField,
      collectionTypes
    );
    componentPickerModal.open({
      options: buildOneOfPickerOptions(orderedSchemas),
      onSelect: (opt) => {
        const typeName = opt.schema.name;
        callback(
          buildOneOfTypeValue(
            typeName,
            typesMap[typeName] || opt.schema,
            collectionTypes,
            opt.preset?.data
          )
        );
        componentPickerModal.close();
      },
    });
  };

  const add = () => {
    if (!testCanAddItem()) {
      return;
    }
    withNewItemValue((defaultValue) => {
      dispatch({
        type: 'add',
        draft: draft,
        deepKey: props.deepKey,
        defaultValue: defaultValue,
      });
    });
  };

  const pasteBefore = (index: number, data: ClipboardData) => {
    if (!testCanAddItem()) {
      return;
    }
    dispatch({
      type: 'pasteBefore',
      draft: draft,
      deepKey: props.deepKey,
      index: index,
      data,
    });
  };

  const pasteAfter = (
    index: number,
    data: ClipboardData,
    options?: {isMove?: boolean}
  ) => {
    if (!testCanAddItem(options)) {
      return;
    }
    dispatch({
      type: 'pasteAfter',
      draft: draft,
      deepKey: props.deepKey,
      index: index,
      data,
    });
  };

  const pasteBeforeFromVirtualClipboard = async (index: number) => {
    pasteBefore(index, await virtualClipboard.get());
  };

  const pasteAfterFromVirtualClipboard = async (index: number) => {
    pasteAfter(index, await virtualClipboard.get());
  };

  const insertBefore = (index: number) => {
    if (!testCanAddItem()) {
      return;
    }
    withNewItemValue((defaultValue) => {
      dispatch({
        type: 'insertBefore',
        draft: draft,
        deepKey: props.deepKey,
        index: index,
        defaultValue: defaultValue,
      });
    });
  };

  const insertAfter = (index: number) => {
    if (!testCanAddItem()) {
      return;
    }
    withNewItemValue((defaultValue) => {
      dispatch({
        type: 'insertAfter',
        draft: draft,
        deepKey: props.deepKey,
        index: index,
        defaultValue: defaultValue,
      });
    });
  };

  const duplicate = (index: number) => {
    if (!testCanAddItem()) {
      return;
    }
    dispatch({
      type: 'duplicate',
      draft: draft,
      deepKey: props.deepKey,
      index: index,
      value: getItemValue(index),
    });
  };

  const removeAt = (index: number) => {
    // The label appears in the undo tooltip. When called from a cut+paste
    // move, the nested group joins the outer "Moved item" group instead.
    draft.history.group('Removed item', () => {
      dispatch({
        type: 'removeAt',
        draft: draft,
        deepKey: props.deepKey,
        index: index,
      });
    });
  };

  /** Removes an item and offers a transient "Undo" action. */
  const removeItem = (index: number) => {
    removeAt(index);
    showUndoNotification(draft, 'Item removed');
  };

  /** Focus the field header (the clickable "summary" part). */
  const focusFieldHeader = (deepKey: string, index: number) => {
    document.getElementById(`summary-for-${deepKey}.${order[index]}`)?.focus();
  };

  const moveUp = (index: number) => {
    if (index > 0) {
      dispatch({
        type: 'moveUp',
        draft: draft,
        deepKey: props.deepKey,
        index: index,
      });
    }
  };

  const moveDown = (index: number) => {
    if (index < order.length - 1) {
      dispatch({
        type: 'moveDown',
        draft: draft,
        deepKey: props.deepKey,
        index: index,
      });
    }
  };

  /** Copies the item data to the virtual clipboard. */
  const copyToVirtualClipboard = (index: number) => {
    const data = getItemValue(index);
    virtualClipboard.set(data);
    setCutIndex(null);
    showNotification({
      message: 'Copied to clipboard',
      autoClose: 2000,
    });
  };

  const cutToVirtualClipboard = (index: number) => {
    const data = getItemValue(index);
    virtualClipboard.set(data);
    setCutIndex(index);
    showNotification({
      message: 'Cut to clipboard',
      autoClose: 2000,
    });
  };

  const pasteFromVirtualClipboard = async (index: number) => {
    const data = await virtualClipboard.get();
    if (!data) {
      showNotification({
        message: 'Clipboard empty (nothing to paste)',
        color: 'red',
        autoClose: 2000,
      });
      return;
    }

    // Group so that a cut+paste (move) undoes as a single step.
    draft.history.group('Moved item', () => {
      pasteAfter(index, data, {isMove: cutIndex !== null});
      if (cutIndex !== null) {
        let indexToRemove = cutIndex;
        if (index < cutIndex) {
          indexToRemove += 1;
        }
        removeAt(indexToRemove);
        setCutIndex(null);
      }
    });
    showNotification({
      message: 'Pasted item',
      autoClose: 2000,
    });
  };

  const editJsonModal = useEditJsonModal();
  const aiEditModal = useAiEditModal();

  const editJson = (index: number) => {
    const data = getItemValue(index);
    editJsonModal.open({
      data: data,
      onSave: (newValue) => {
        console.log('[edit json] onSave()', newValue);
        dispatch({
          type: 'updateItem',
          draft,
          index,
          newValue: newValue,
          deepKey: props.deepKey,
        });
        editJsonModal.close();
      },
    });
  };

  const aiEdit = (index: number) => {
    const data = getItemValue(index);
    aiEditModal.open({
      data: data,
      onSave: (newValue) => {
        console.log('[ai edit] onSave()', newValue);
        dispatch({
          type: 'updateItem',
          draft,
          index,
          newValue: newValue,
          deepKey: props.deepKey,
        });
        aiEditModal.close();
      },
    });
  };

  function itemInDeeplink(itemKey: string) {
    return Boolean(deeplink.value.startsWith(`${props.deepKey}.${itemKey}`));
  }

  /** Handler for using the arrow keys when the array item's header is focused.  */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent, arrayKey: string) => {
      if (!e.target) {
        return;
      }
      const index = order.indexOf(arrayKey);
      // Move the items up and down using the up/down arrow keys.
      // Collapse and expand the item using the left/right arrow keys.
      if (e.metaKey && e.key === 'x') {
        e.preventDefault();
        cutToVirtualClipboard(index);
      } else if (e.metaKey && e.key === 'c') {
        e.preventDefault();
        copyToVirtualClipboard(index);
      } else if (e.metaKey && e.key === 'v') {
        e.preventDefault();
        pasteFromVirtualClipboard(index);
      } else if (e.metaKey && (e.key === 'Backspace' || e.key === 'Delete')) {
        e.preventDefault();
        removeItem(index);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveUp(index);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveDown(index);
      } else if (e.key === 'ArrowLeft') {
        (e.target as HTMLElement).closest('details')!.open = false;
      } else if (e.key === 'ArrowRight') {
        (e.target as HTMLElement).closest('details')!.open = true;
      }
    },
    [props.deepKey, order, cutIndex]
  );

  const addButtonRow = (
    <>
      {nestingWarning && (
        <div
          className={cn(
            'DocEditor__ArrayField__nestingWarning mt-4 flex items-start gap-2 rounded-sm border px-2.5 py-2 text-sm leading-snug text-strong',
            canAddItem
              ? 'border-warning-line bg-warning-soft'
              : 'border-danger-line bg-danger-soft'
          )}
          data-severity={canAddItem ? 'warning' : 'error'}
        >
          <IconAlertTriangle
            size={16}
            className={cn(
              'mt-px shrink-0',
              canAddItem ? 'text-warning' : 'text-danger'
            )}
          />
          <div className="DocEditor__ArrayField__nestingWarning__message">
            {nestingWarning}
          </div>
        </div>
      )}
      <div className="DocEditor__ArrayField__add mt-4 flex items-center gap-1">
        <ConditionalTooltip
          label={addDisabledReason}
          condition={!!addDisabledReason}
        >
          <Button
            className="DocEditor__ArrayField__add__button"
            variant="primary"
            icon={<IconCirclePlus />}
            onClick={() => add()}
            disabled={!!addDisabledReason}
          >
            {field.buttonLabel || 'Add'}
          </Button>
        </ConditionalTooltip>
        <Menu
          className="DocEditor__ArrayField__add__menu"
          trigger={
            <IconButton
              className="DocEditor__ArrayField__item__header__controls__dots text-strong"
              label="More actions"
            >
              <IconDotsVertical />
            </IconButton>
          }
        >
          <MenuGroup label="CLIPBOARD">
            <MenuItem
              className="DocEditor__ArrayField__menu__item"
              icon={<IconRowInsertBottom />}
              onClick={() => pasteFromVirtualClipboard(order.length - 1)}
              disabled={!canAddItem || (maxItemsReached && cutIndex === null)}
            >
              Paste item to end
            </MenuItem>
          </MenuGroup>
        </Menu>
      </div>
    </>
  );

  if (order.length === 0 && !value._new) {
    return (
      <div className="DocEditor__ArrayField">
        <div className="DocEditor__ArrayField__items">
          <div className="DocEditor__ArrayField__items__empty font-mono">
            No items
          </div>
        </div>
        {addButtonRow}
      </div>
    );
  }

  return (
    <div className="DocEditor__ArrayField">
      <DragDropContext
        onDragEnd={(result: DropResult) => {
          const {source, destination} = result;
          if (!destination) {
            return;
          }
          dispatch({
            type: 'moveTo',
            fromIndex: source.index,
            toIndex: destination.index,
            draft,
            deepKey: props.deepKey,
          });
        }}
      >
        <Droppable droppableId="dnd-list" direction="vertical">
          {(provided: DroppableProvided) => (
            <div
              {...provided.droppableProps}
              ref={provided.innerRef}
              className="DocEditor__ArrayField__items"
            >
              {order.map((key: string, i: number) => {
                return (
                  <DocEditor.ArrayFieldItem
                    key={key}
                    field={field}
                    parentDeepKey={props.deepKey}
                    itemKey={key}
                    index={i}
                    initialOpen={
                      newlyAdded.includes(key) ||
                      itemInDeeplink(key) ||
                      !!field.defaultOpen
                    }
                    isCut={cutIndex === i}
                    canAddItem={canAddItem && !maxItemsReached}
                    aiEnabled={testAiEnabled()}
                    onFocusHeader={focusFieldHeader}
                    onHeaderKeyDown={handleKeyDown}
                    onMoveUp={moveUp}
                    onMoveDown={moveDown}
                    onInsertBefore={insertBefore}
                    onInsertAfter={insertAfter}
                    onDuplicate={duplicate}
                    onCopy={copyToVirtualClipboard}
                    onPasteBefore={pasteBeforeFromVirtualClipboard}
                    onPasteAfter={pasteAfterFromVirtualClipboard}
                    onEditJson={editJson}
                    onAiEdit={aiEdit}
                    onRemove={removeItem}
                  />
                );
              })}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
      {addButtonRow}
    </div>
  );
};

interface ArrayFieldItemProps {
  field: schema.ArrayField;
  parentDeepKey: string;
  itemKey: string;
  index: number;
  initialOpen: boolean;
  isCut: boolean;
  /**
   * Whether another item can be added here, i.e. without blowing past
   * Firestore's field nesting limit or the field's `maxItems`. When false, the
   * insert, duplicate, and paste actions are disabled.
   */
  canAddItem: boolean;
  aiEnabled: boolean;
  onFocusHeader: (deepKey: string, index: number) => void;
  onHeaderKeyDown: (e: KeyboardEvent, arrayKey: string) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onInsertBefore: (index: number) => void;
  onInsertAfter: (index: number) => void;
  onDuplicate: (index: number) => void;
  onCopy: (index: number) => void;
  onPasteBefore: (index: number) => void;
  onPasteAfter: (index: number) => void;
  onEditJson: (index: number) => void;
  onAiEdit: (index: number) => void;
  onRemove: (index: number) => void;
}

DocEditor.ArrayFieldItem = (props: ArrayFieldItemProps) => {
  const itemDeepKey = `${props.parentDeepKey}.${props.itemKey}`;

  return (
    <Draggable
      key={props.itemKey}
      index={props.index}
      draggableId={props.itemKey}
    >
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...(provided.draggableProps as any)}
          className={cn(
            'DocEditor__ArrayField__item__wrapper mb-2 flex w-full flex-row items-center gap-0.5 transition duration-300',
            snapshot.isDragging &&
              'DocEditor__ArrayField__item__wrapper--dragging overflow-hidden rounded-sm border border-border bg-surface-hover shadow-md',
            props.isCut &&
              'DocEditor__ArrayField__item__wrapper--cut rounded-sm opacity-65 outline-1 outline-dashed outline-subtle'
          )}
        >
          <div
            className="DocEditor__ArrayField__item__handle flex h-7 shrink-0 items-center justify-center"
            {...(provided.dragHandleProps as any)}
            onClick={() =>
              props.onFocusHeader(props.parentDeepKey, props.index)
            }
          >
            <IconGripVertical size={18} stroke={'1.5'} />
          </div>
          <details
            className="DocEditor__ArrayField__item min-w-0 flex-1"
            open={props.initialOpen}
            onToggle={(e) => {
              if ((e.target as HTMLDetailsElement).open) {
                requestHighlightNode(itemDeepKey, {scroll: true});
              } else {
                requestHighlightNode(null);
              }
            }}
            onMouseEnter={() => {
              requestHighlightNode(itemDeepKey);
            }}
            onMouseLeave={() => {
              requestHighlightNode(null);
            }}
          >
            <summary
              id={`summary-for-${itemDeepKey}`}
              className="DocEditor__ArrayField__item__header"
              onKeyDown={(e: KeyboardEvent) =>
                props.onHeaderKeyDown(e, props.itemKey)
              }
              tabIndex={0}
            >
              <div className="DocEditor__ArrayField__item__header__icon flex">
                <IconTriangleFilled size={6} />
              </div>
              <DocEditor.ArrayFieldPreview
                field={props.field}
                deepKey={itemDeepKey}
                index={props.index}
              />
              <div className="DocEditor__ArrayField__item__header__controls flex shrink-0 items-center gap-1">
                <div className="DocEditor__ArrayField__item__header__controls__arrows flex gap-2">
                  <button
                    type="button"
                    className={cn(
                      'DocEditor__ArrayField__item__header__controls__arrow DocEditor__ArrayField__item__header__controls__arrows--up',
                      ARRAY_ARROW_CLASSES
                    )}
                    aria-label="Move up"
                    onClick={() => props.onMoveUp(props.index)}
                  >
                    <IconCircleArrowUp size={20} strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'DocEditor__ArrayField__item__header__controls__arrow DocEditor__ArrayField__item__header__controls__arrows--down',
                      ARRAY_ARROW_CLASSES
                    )}
                    aria-label="Move down"
                    onClick={() => props.onMoveDown(props.index)}
                  >
                    <IconCircleArrowDown size={20} strokeWidth={1.75} />
                  </button>
                </div>
                <Menu
                  className="DocEditor__ArrayField__item__header__controls__menu"
                  placement="bottom"
                  trigger={
                    <IconButton
                      className="DocEditor__ArrayField__item__header__controls__dots text-strong"
                      label="Item actions"
                      onClick={(e: MouseEvent) => {
                        // Keep the click from toggling the item.
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onKeyDown={stopArrowKeys}
                    >
                      <IconDotsVertical />
                    </IconButton>
                  }
                >
                  <MenuGroup label="INSERT">
                    <MenuItem
                      className="DocEditor__ArrayField__menu__item"
                      icon={<IconRowInsertTop />}
                      onClick={() => props.onInsertBefore(props.index)}
                      disabled={!props.canAddItem}
                    >
                      Add before
                    </MenuItem>
                    <MenuItem
                      className="DocEditor__ArrayField__menu__item"
                      icon={<IconRowInsertBottom />}
                      onClick={() => props.onInsertAfter(props.index)}
                      disabled={!props.canAddItem}
                    >
                      Add after
                    </MenuItem>
                    <MenuItem
                      className="DocEditor__ArrayField__menu__item"
                      icon={<IconCopy />}
                      onClick={() => props.onDuplicate(props.index)}
                      disabled={!props.canAddItem}
                    >
                      Duplicate
                    </MenuItem>
                  </MenuGroup>
                  <MenuGroup label="CLIPBOARD">
                    <MenuItem
                      className="DocEditor__ArrayField__menu__item"
                      icon={<IconClipboardCopy />}
                      onClick={() => props.onCopy(props.index)}
                    >
                      Copy
                    </MenuItem>
                    <MenuItem
                      className="DocEditor__ArrayField__menu__item"
                      icon={<IconRowInsertTop />}
                      onClick={() => props.onPasteBefore(props.index)}
                      disabled={!props.canAddItem}
                    >
                      Paste before
                    </MenuItem>
                    <MenuItem
                      className="DocEditor__ArrayField__menu__item"
                      icon={<IconRowInsertBottom />}
                      onClick={() => props.onPasteAfter(props.index)}
                      disabled={!props.canAddItem}
                    >
                      Paste after
                    </MenuItem>
                  </MenuGroup>
                  <MenuGroup label="CODE">
                    <MenuItem
                      className="DocEditor__ArrayField__menu__item"
                      icon={<IconBraces />}
                      onClick={() => props.onEditJson(props.index)}
                    >
                      Edit JSON
                    </MenuItem>
                    {props.aiEnabled && (
                      <MenuItem
                        className="DocEditor__ArrayField__menu__item"
                        icon={<IconRootAI size={16} />}
                        onClick={() => props.onAiEdit(props.index)}
                      >
                        Edit with Root AI
                      </MenuItem>
                    )}
                  </MenuGroup>
                  <MenuGroup label="REMOVE">
                    <MenuItem
                      className="DocEditor__ArrayField__menu__item"
                      icon={<IconTrash />}
                      onClick={() => props.onRemove(props.index)}
                    >
                      Remove
                    </MenuItem>
                  </MenuGroup>
                </Menu>
              </div>
            </summary>
            <div className="DocEditor__ArrayField__item__body border-2 border-t-0 border-solid border-border p-4 max-md:p-3">
              <DocEditor.Field
                key={itemDeepKey}
                field={props.field.of}
                deepKey={itemDeepKey}
                hideHeader
                isArrayChild
                onFocus={() => {
                  requestHighlightNode(itemDeepKey, {scroll: true});
                }}
                onBlur={() => {
                  requestHighlightNode(null);
                }}
              />
            </div>
          </details>
        </div>
      )}
    </Draggable>
  );
};

/** The move up and move down buttons in an array item's header. */
const ARRAY_ARROW_CLASSES =
  'relative m-0 flex cursor-pointer appearance-none rounded-full border-0 bg-transparent p-0 text-strong transition-transform duration-200 active:translate-y-0.5 focus-visible:outline-2 focus-visible:outline-focus pointer-coarse:after:absolute pointer-coarse:after:-inset-2.5';

interface ArrayFieldPreviewProps {
  field: schema.ArrayField;
  deepKey: string;
  index: number;
}

DocEditor.ArrayFieldPreview = (props: ArrayFieldPreviewProps) => {
  const draft = useDraftDoc().controller;
  const types = useCollectionSchemaTypes();
  const [value, setValue] = useState<any>(draft.getValue(props.deepKey));

  const previewImage = useMemo(() => {
    return arrayPreviewImage(props.field, value, types);
  }, [props.field, types, value]);
  const previewText = useMemo(() => {
    return arrayPreview(props.field, value, props.index, types);
  }, [props.field, props.index, types, value]);

  const updateValue = useMemo(
    () =>
      debounce((newValue: any) => {
        if (newValue && typeof newValue === 'object') {
          // A new object is created to force re-rendering on the preview text.
          setValue({...newValue});
        } else {
          setValue(newValue);
        }
      }, 250),
    []
  );

  useEffect(() => {
    return draft.subscribeSubtree(props.deepKey, updateValue);
  }, [props.deepKey, draft, updateValue]);

  return (
    <div className="DocEditor__ArrayField__item__header__preview flex w-0 flex-1 items-center gap-2.5 overflow-hidden">
      {previewImage && (
        <div className="DocEditor__ArrayField__item__header__preview__image flex size-8 shrink-0 items-center justify-center">
          <img
            src={previewImage}
            alt=""
            className="DocEditor__ArrayField__item__header__preview__image__img h-auto w-full"
            loading="lazy"
          />
        </div>
      )}
      <div
        className="DocEditor__ArrayField__item__header__preview__title min-w-0 flex-1 truncate pr-2 font-mono text-sm font-medium"
        data-preview={previewText}
      />
    </div>
  );
};

DocEditor.OneOfField = (props: FieldProps) => {
  const field = props.field as schema.OneOfField;
  const variant = getOneOfVariant(field);
  const [type, setType] = useState('');
  const collectionTypes = useCollectionSchemaTypes();
  const {typeNames, typesMap, orderedSchemas} = resolveOneOfTypes(
    field,
    collectionTypes
  );
  const dropdownValues: Array<{value: string; label: string}> = [
    {value: '', label: field.placeholder || 'Select type'},
    ...typeNames.map((name) => ({value: name, label: name})),
  ];
  const selectedType = typesMap[type || ''];
  const draft = useDraftDoc().controller;
  const componentPickerModal = useComponentPickerModal();

  const cachedValues = useMemo<any>(() => {
    return {};
  }, []);

  async function applyType(newType: string, prefill?: Record<string, any>) {
    let newValue: any;
    if (newType && !prefill && newType in cachedValues) {
      // When swapping to a previously selected type, reset to the previous
      // value.
      newValue = {...cachedValues[newType], _type: newType};
    } else {
      newValue = buildOneOfTypeValue(
        newType,
        typesMap[newType],
        collectionTypes,
        prefill
      );
    }

    await draft.updateKey(props.deepKey, newValue);
    setType(newType);
  }

  async function onTypeChange(newType: string) {
    await applyType(newType);
  }

  useDraftDocField(props.deepKey, (newValue: any) => {
    // Keep local selection state in sync when the value is cleared externally.
    setType(newValue?._type || '');
    if (newValue?._type) {
      cachedValues[newValue._type] = newValue;
    }
  });

  // When the dropdown receives focus, highlight the <input> text so that it can
  // be easily searched.
  function onDropdownFocus(e: FocusEvent) {
    const target = e.target as HTMLInputElement;
    if (target && target.select) {
      target.select();
    }
  }

  function openPicker() {
    componentPickerModal.open({
      options: buildOneOfPickerOptions(orderedSchemas),
      onSelect: async (opt) => {
        await applyType(opt.schema.name, opt.preset?.data);
        componentPickerModal.close();
      },
      // Only allow removal when a component is currently selected.
      onRemove: selectedType
        ? async () => {
            await applyType('');
            componentPickerModal.close();
          }
        : undefined,
    });
  }

  const fieldsBlock = selectedType && (
    <div className="DocEditor__OneOfField__fields mt-4 flex flex-col gap-6">
      {selectedType.fields.map((subField) => (
        <DocEditor.Field
          key={`${type}::${subField.id}`}
          field={subField}
          deepKey={`${props.deepKey}.${subField.id!}`}
          onBlur={() => {
            requestHighlightNode(null);
          }}
          onFocus={() => {
            requestHighlightNode(`${props.deepKey}.${subField.id!}`, {
              scroll: true,
            });
          }}
        />
      ))}
    </div>
  );

  if (variant === 'picker') {
    const buttonLabel = selectedType
      ? selectedType.label || selectedType.name
      : field.placeholder || 'Select type';
    return (
      <div className="DocEditor__OneOfField DocEditor__OneOfField--picker">
        <div className="DocEditor__OneOfField__pickerButton flex items-center justify-end gap-2">
          <div className="DocEditor__OneOfField__select__label font-semibold">
            Type:
          </div>
          <Button
            className="min-w-0 font-medium"
            onClick={openPicker}
            iconRight={<IconChevronDown />}
          >
            {buttonLabel}
          </Button>
        </div>
        {fieldsBlock}
      </div>
    );
  }

  return (
    <div className="DocEditor__OneOfField">
      <div className="DocEditor__OneOfField__select flex items-center justify-end gap-2">
        <div className="DocEditor__OneOfField__select__label shrink-0 font-semibold">
          Type:
        </div>
        <Select
          className="w-48 min-w-0"
          inputClassName="rounded-none"
          aria-label="Type"
          data={dropdownValues}
          value={type}
          placeholder={field.placeholder}
          onValueChange={(value) => onTypeChange(value || '')}
          onFocus={onDropdownFocus}
          searchable
        />
      </div>
      {fieldsBlock}
    </div>
  );
};

/** Returns the effective UI variant for a oneOf field. */
function getOneOfVariant(field: schema.OneOfField): 'dropdown' | 'picker' {
  return field.variant || window.__ROOT_CTX.defaultOneOfVariant || 'dropdown';
}

/**
 * Resolves a oneOf field's `types` (which may be inline schemas or names of
 * collection-level schemas) into their schema definitions.
 */
function resolveOneOfTypes(
  field: schema.OneOfField,
  collectionTypes: Record<string, schema.Schema>
) {
  const oneOfTypes = Array.isArray(field.types) ? field.types : [];
  /** All declared type names, including ones that failed to resolve. */
  const typeNames: string[] = [];
  const typesMap: Record<string, schema.Schema> = {};
  const orderedSchemas: schema.Schema[] = [];
  oneOfTypes.forEach((typedef) => {
    let resolved: schema.Schema | undefined;
    let name: string;
    if (typeof typedef === 'string') {
      resolved = collectionTypes[typedef];
      name = typedef;
    } else {
      resolved = typedef;
      name = typedef.name;
    }
    if (!name) {
      return;
    }
    if (resolved) {
      typesMap[name] = resolved;
      orderedSchemas.push(resolved);
    }
    typeNames.push(name);
  });
  return {typeNames, typesMap, orderedSchemas};
}

/** Builds the component picker cards (blank + presets) for oneOf schemas. */
function buildOneOfPickerOptions(
  schemas: schema.Schema[]
): ComponentPickerOption[] {
  const options: ComponentPickerOption[] = [];
  schemas.forEach((s) => {
    options.push({key: `${s.name}::__blank__`, schema: s});
    (s.presets || []).forEach((preset) => {
      options.push({
        key: `${s.name}::${preset.id}`,
        schema: s,
        preset,
      });
    });
  });
  return options;
}

/**
 * Builds the initial value for a oneOf field when a type is selected, using
 * the schema's defaults and an optional preset's data.
 */
function buildOneOfTypeValue(
  typeName: string,
  typeSchema: schema.Schema | undefined,
  collectionTypes: Record<string, schema.Schema>,
  prefill?: Record<string, any>
): Record<string, any> {
  const newValue: Record<string, any> = {};
  if (typeName && typeSchema) {
    if (prefill) {
      // Preset path: normalize prefill so any plain `[]` arrays in the
      // preset's data become array-maps for proper CMS rendering, then
      // deep-merge over schema defaults so nested objects merge instead of
      // clobbering each other.
      const defaults = getDefaultFieldValue(typeSchema);
      const normalized = normalizePresetData(
        typeSchema,
        prefill,
        collectionTypes
      );
      Object.assign(newValue, deepMerge(defaults, normalized));
    } else {
      Object.assign(newValue, getDefaultFieldValue(typeSchema));
    }
  }
  newValue._type = typeName;
  return newValue;
}

/**
 * Swaps two elements in an array at the specified indices.
 *
 * @example
 * ```typescript
 * const numbers = [1, 2, 3, 4];
 * arraySwap(numbers, 0, 2); // Returns [3, 2, 1, 4]
 * ```
 */
function arraySwap<T = unknown>(arr: T[], index1: number, index2: number) {
  if (arr.length <= 1) {
    return arr;
  }
  const tmp = arr[index1];
  arr[index1] = arr[index2];
  arr[index2] = tmp;
  return arr;
}

/**
 * Moves an element in an array from one index to another.
 *
 * @example
 * ```typescript
 * const numbers = [1, 2, 3, 4];
 * arrayMove(numbers, 0, 2); // Returns [2, 3, 1, 4]
 * ```
 */
function arrayMove<T = unknown>(arr: T[], fromIndex: number, toIndex: number) {
  const [movedElement] = arr.splice(fromIndex, 1);
  arr.splice(toIndex, 0, movedElement);
}

/** Returns the string templates for field previews from the schema-level data. */
function getSchemaPreviewTemplates(
  arrayOfField: schema.ObjectLikeField,
  data: any,
  types: Record<string, schema.Schema>,
  key: 'title' | 'image' = 'title'
): string | string[] | null {
  if (arrayOfField.type === 'oneof') {
    const oneOfField = arrayOfField as schema.OneOfField;
    const selectedTypeName = data?._type;
    if (selectedTypeName) {
      let selectedSchema: schema.Schema | undefined;
      const fieldTypes = Array.isArray(oneOfField.types)
        ? oneOfField.types
        : [];
      if (typeof fieldTypes[0] === 'string') {
        selectedSchema = types[selectedTypeName];
      } else {
        selectedSchema = (fieldTypes as any[]).find(
          (schema) => schema.name === selectedTypeName
        );
      }
      return selectedSchema?.preview?.[key] || null;
    }
  }
  return null;
}

/** Builds the preview image for an array item. */
function arrayPreviewImage(
  field: schema.ArrayField,
  data: any,
  types: Record<string, schema.Schema>
): string | undefined {
  const schemaLevelTemplates = getSchemaPreviewTemplates(
    field.of,
    data,
    types,
    'image'
  );
  if (!schemaLevelTemplates) {
    return undefined;
  }
  return buildPreviewValue(schemaLevelTemplates, data);
}

/** Builds the preview for an array item. */
function arrayPreview(
  field: schema.ArrayField,
  data: any,
  index: number,
  types: Record<string, schema.Schema>
): string {
  // First, check if the item has a preview defined at the schema level.
  const schemaLevelTemplates = getSchemaPreviewTemplates(
    field.of,
    data,
    types,
    'title'
  );
  if (schemaLevelTemplates) {
    const result = buildPreviewValue(schemaLevelTemplates, data, {index});
    if (result) {
      return result;
    }
  }
  // Fall back to array-level preview.
  if (!field.preview) {
    return `item ${index}`;
  }
  return buildPreviewValue(field.preview, data, {index}) ?? `item ${index}`;
}

function getMetadataKey(key: string) {
  const parts = key.split('.');
  const last = parts.pop();
  return [...parts, `@${last}`].join('.');
}
