import {IconX} from '@tabler/icons-preact';
import {useCallback, useEffect, useMemo, useRef, useState} from 'preact/hooks';
import {FieldCommentThread, isOpenThread} from '../../../../shared/comments.js';
import {Badge} from '../../../primitives/Badge/Badge.js';
import {IconButton} from '../../../primitives/IconButton/IconButton.js';
import {SegmentedControl} from '../../../primitives/SegmentedControl/SegmentedControl.js';
import {Spinner} from '../../../primitives/Spinner/Spinner.js';
import {joinClassNames} from '../../../utils/classes.js';
import {useCollectionSchema} from '../../collections/useCollectionSchema.js';
import {formatFieldPath} from '../../documents/field-labels.js';
import {useDraftDoc} from '../../documents/useDraftDoc.js';
import {CommentThread} from '../CommentThread/CommentThread.js';
import {useFieldComments} from '../useFieldComments.js';

type CommentsFilter = 'open' | 'resolved' | 'all';

const EMPTY_CLASSES =
  'CommentsPanel__empty px-1 py-2 text-sm leading-normal text-muted';

export interface CommentsPanelProps {
  /** The document ID whose comments are shown. */
  docId: string;
  /**
   * Field to focus when the panel opens: its thread is scrolled into view and
   * highlighted, or a new-comment composer is shown when the field has no
   * thread yet.
   */
  focusFieldKey?: string | null;
  /** Called once the focused field has been handled. */
  onFocusHandled?: () => void;
  onClose?: () => void;
}

/**
 * Right-hand panel on the document page listing every comment thread on the
 * doc, with filters for open and resolved threads.
 */
export function CommentsPanel(props: CommentsPanelProps) {
  const ctx = useFieldComments();
  const draft = useDraftDoc();
  const collectionId = props.docId.split('/')[0];
  const collection = useCollectionSchema(collectionId);
  const [filter, setFilter] = useState<CommentsFilter>('open');
  const [draftFieldKey, setDraftFieldKey] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const threads = ctx?.threads || [];
  const openCount = ctx?.openCount || 0;
  const resolvedCount = threads.length - openCount;

  const getValue = useCallback(
    (deepKey: string) => draft.controller?.getValue(deepKey),
    [draft.controller]
  );

  const labelFor = useCallback(
    (fieldKey: string, fallback?: string) => {
      if (collection.schema) {
        return formatFieldPath(collection.schema, fieldKey, getValue);
      }
      return fallback || fieldKey;
    },
    [collection.schema, getValue]
  );

  const visibleThreads = useMemo(() => {
    if (filter === 'all') {
      return threads;
    }
    return threads.filter((thread) =>
      filter === 'open' ? isOpenThread(thread) : !isOpenThread(thread)
    );
  }, [threads, filter]);

  // Handle a request to focus a field: show its thread (switching filters if
  // needed) or a fresh composer for a field without comments.
  const focusFieldKey = props.focusFieldKey;
  useEffect(() => {
    if (!focusFieldKey || ctx?.loading) {
      return;
    }
    if (ctx?.threadsByFieldKey.has(focusFieldKey)) {
      setDraftFieldKey(null);
      if (filter === 'resolved') {
        setFilter('all');
      }
    } else {
      // No open thread on the field: offer a composer for a new one.
      setDraftFieldKey(focusFieldKey);
    }
    // Wait for the list to render before scrolling.
    requestAnimationFrame(() => {
      const el = bodyRef.current?.querySelector<HTMLElement>(
        `[data-field-key="${CSS.escape(focusFieldKey)}"]`
      );
      el?.scrollIntoView({block: 'nearest', behavior: 'smooth'});
      props.onFocusHandled?.();
    });
  }, [focusFieldKey, ctx?.loading]);

  // Drop the draft composer once its field gains a thread.
  useEffect(() => {
    if (draftFieldKey && ctx?.threadsByFieldKey.has(draftFieldKey)) {
      setDraftFieldKey(null);
    }
  }, [draftFieldKey, ctx?.threadsByFieldKey]);

  // Scroll the editor to a field. Reuses the `scrollToDeeplink` postMessage
  // handler in the editor's DeeplinkProvider (the same mechanism the preview
  // iframe and search panel use), which updates the URL, opens any collapsed
  // ancestors, and highlights the field.
  const navigateTo = (fieldKey: string) => {
    window.postMessage({scrollToDeeplink: {deepKey: fieldKey}}, '*');
  };

  // Starts a new thread on a field from one of its resolved threads. The
  // field's open thread is focused instead when it already has one.
  const startNewThread = (fieldKey: string) => {
    if (!ctx?.threadsByFieldKey.has(fieldKey)) {
      setDraftFieldKey(fieldKey);
    }
    if (filter === 'resolved') {
      setFilter('all');
    }
    requestAnimationFrame(() => {
      const el = bodyRef.current?.querySelector<HTMLElement>(
        `[data-field-key="${CSS.escape(fieldKey)}"]`
      );
      el?.scrollIntoView({block: 'nearest', behavior: 'smooth'});
    });
  };

  return (
    <div className="CommentsPanel flex h-full flex-col overflow-hidden">
      <div className="CommentsPanel__header flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border bg-surface px-3">
        <div className="CommentsPanel__header__title flex items-center gap-1.5 text-sm font-semibold">
          Comments
          {openCount > 0 && (
            <Badge className="CommentsPanel__header__count" tone="info">
              {openCount}
            </Badge>
          )}
        </div>
        {props.onClose && (
          <IconButton size="xs" onClick={props.onClose} label="Close comments">
            <IconX />
          </IconButton>
        )}
      </div>
      <div className="CommentsPanel__filters shrink-0 border-b border-border px-3 py-2">
        <SegmentedControl
          aria-label="Comment filters"
          size="xs"
          fullWidth
          value={filter}
          onValueChange={setFilter}
          data={[
            {value: 'open', label: `Open (${openCount})`},
            {value: 'resolved', label: `Resolved (${resolvedCount})`},
            {value: 'all', label: 'All'},
          ]}
        />
      </div>
      <div
        className="CommentsPanel__body flex flex-1 flex-col gap-2.5 overflow-auto p-3"
        ref={bodyRef}
      >
        {ctx?.loading ? (
          <div className="CommentsPanel__loading flex justify-center p-6 text-muted">
            <Spinner />
          </div>
        ) : ctx?.error ? (
          <div className={EMPTY_CLASSES}>Failed to load comments.</div>
        ) : (
          <>
            {draftFieldKey && (
              <CommentsPanelThread
                key={`draft:${draftFieldKey}`}
                docId={props.docId}
                fieldKey={draftFieldKey}
                fieldLabel={labelFor(draftFieldKey)}
                thread={null}
                focused={true}
                autoFocus
                onNavigate={() => navigateTo(draftFieldKey)}
              />
            )}
            {visibleThreads.map((thread) => (
              <CommentsPanelThread
                key={thread.id}
                docId={props.docId}
                fieldKey={thread.fieldKey}
                fieldLabel={labelFor(thread.fieldKey, thread.fieldLabel)}
                thread={thread}
                focused={
                  thread.fieldKey === focusFieldKey && isOpenThread(thread)
                }
                onNavigate={() => navigateTo(thread.fieldKey)}
                onStartNewThread={() => startNewThread(thread.fieldKey)}
              />
            ))}
            {visibleThreads.length === 0 && !draftFieldKey && (
              <div className={EMPTY_CLASSES}>
                {threads.length === 0
                  ? 'No comments yet. Use the comment button next to a field label to start a thread.'
                  : filter === 'open'
                    ? 'No open comments.'
                    : 'No resolved comments.'}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface CommentsPanelThreadProps {
  docId: string;
  fieldKey: string;
  fieldLabel: string;
  thread: FieldCommentThread | null;
  focused?: boolean;
  autoFocus?: boolean;
  onNavigate: () => void;
  onStartNewThread?: () => void;
}

function CommentsPanelThread(props: CommentsPanelThreadProps) {
  return (
    <div
      className={joinClassNames(
        'CommentsPanel__thread',
        props.focused && 'CommentsPanel__thread--focused',
        'rounded-lg border bg-surface p-3 transition-[border-color,box-shadow] duration-200',
        props.focused ? 'border-focus ring-2 ring-focus/20' : 'border-border'
      )}
      data-field-key={props.fieldKey}
    >
      <CommentThread
        docId={props.docId}
        fieldKey={props.fieldKey}
        fieldLabel={props.fieldLabel}
        thread={props.thread}
        autoFocus={props.autoFocus}
        onNavigate={props.onNavigate}
        onStartNewThread={props.onStartNewThread}
      />
    </div>
  );
}
