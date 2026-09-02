import './CommentsPanel.css';

import {ActionIcon, Loader, SegmentedControl} from '@mantine/core';
import {IconX} from '@tabler/icons-preact';
import {useCallback, useEffect, useMemo, useRef, useState} from 'preact/hooks';
import {FieldCommentThread, isOpenThread} from '../../../shared/comments.js';
import {useCollectionSchema} from '../../hooks/useCollectionSchema.js';
import {useDraftDoc} from '../../hooks/useDraftDoc.js';
import {useFieldComments} from '../../hooks/useFieldComments.js';
import {joinClassNames} from '../../utils/classes.js';
import {formatFieldPath} from '../../utils/field-labels.js';
import {CommentThread} from '../CommentThread/CommentThread.js';

type CommentsFilter = 'open' | 'resolved' | 'all';

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
    const thread = ctx?.threadsByFieldKey.get(focusFieldKey);
    if (thread) {
      setDraftFieldKey(null);
      if (!isOpenThread(thread) && filter === 'open') {
        setFilter('all');
      }
    } else {
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

  return (
    <div className="CommentsPanel">
      <div className="CommentsPanel__header">
        <div className="CommentsPanel__header__title">
          Comments
          {openCount > 0 && (
            <span className="CommentsPanel__header__count">{openCount}</span>
          )}
        </div>
        {props.onClose && (
          <ActionIcon size="xs" onClick={props.onClose} title="Close comments">
            <IconX size={14} />
          </ActionIcon>
        )}
      </div>
      <div className="CommentsPanel__filters">
        <SegmentedControl
          size="xs"
          fullWidth
          value={filter}
          onChange={(value: string) => setFilter(value as CommentsFilter)}
          data={[
            {value: 'open', label: `Open (${openCount})`},
            {value: 'resolved', label: `Resolved (${resolvedCount})`},
            {value: 'all', label: 'All'},
          ]}
        />
      </div>
      <div className="CommentsPanel__body" ref={bodyRef}>
        {ctx?.loading ? (
          <div className="CommentsPanel__loading">
            <Loader size="sm" color="gray" />
          </div>
        ) : ctx?.error ? (
          <div className="CommentsPanel__empty">Failed to load comments.</div>
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
                focused={thread.fieldKey === focusFieldKey}
                onNavigate={() => navigateTo(thread.fieldKey)}
              />
            ))}
            {visibleThreads.length === 0 && !draftFieldKey && (
              <div className="CommentsPanel__empty">
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
}

function CommentsPanelThread(props: CommentsPanelThreadProps) {
  return (
    <div
      className={joinClassNames(
        'CommentsPanel__thread',
        props.focused && 'CommentsPanel__thread--focused'
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
      />
    </div>
  );
}
