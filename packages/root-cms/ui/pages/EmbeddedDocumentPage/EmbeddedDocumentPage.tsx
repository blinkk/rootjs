import './EmbeddedDocumentPage.css';

import {useEffect, useRef} from 'preact/hooks';
import {DocEditor} from '../../components/DocEditor/DocEditor.js';
import {
  DraftDocProvider,
  SaveState,
  useDraftDoc,
} from '../../hooks/useDraftDoc.js';
import {usePageTitle} from '../../hooks/usePageTitle.js';
import {useProjectRoles} from '../../hooks/useProjectRoles.js';
import {useArrayParam} from '../../hooks/useQueryParam.js';
import {joinClassNames} from '../../utils/classes.js';
import {CMSDoc} from '../../utils/doc.js';
import {postToParent} from '../../utils/embed-bridge.js';
import {testCanEdit} from '../../utils/permissions.js';

interface EmbeddedDocumentPageProps {
  collection: string;
  slug: string;
}

/**
 * Headless ("embedded") version of the document editor, intended to be loaded
 * inside an iframe / pop-up by a client previewing a page ("click to edit").
 *
 * Renders only the `DocEditor` -- no top nav, sidebar, side-by-side preview, or
 * Checks/Search/AI panels. A `postMessage` bridge notifies the parent window of
 * editor lifecycle events (`ready`, `saved`, `published`). Field focus
 * ("click to edit") works via the existing `DeeplinkProvider` (`?deeplink=` and
 * inbound `scrollToDeeplink` messages). The set of editable fields can be
 * scoped via the `?fields=` query param (comma-separated top-level field ids).
 */
export function EmbeddedDocumentPage(props: EmbeddedDocumentPageProps) {
  const docId = `${props.collection}/${props.slug}`;
  const {roles} = useProjectRoles();
  const currentUserEmail = window.firebase.user.email || '';
  const canEdit = testCanEdit(roles, currentUserEmail);
  return (
    <DraftDocProvider docId={docId} readOnly={!canEdit}>
      <EmbeddedDocumentPageInner {...props} />
    </DraftDocProvider>
  );
}

/** Returns the epoch millis of a Firestore timestamp, or 0 when unavailable. */
function toMillis(ts: CMSDoc['sys']['publishedAt']): number {
  if (ts && typeof (ts as any).toMillis === 'function') {
    return (ts as any).toMillis();
  }
  return 0;
}

function EmbeddedDocumentPageInner(props: EmbeddedDocumentPageProps) {
  const docId = `${props.collection}/${props.slug}`;
  usePageTitle(docId);
  const draft = useDraftDoc();
  const controller = draft.controller;
  const loading = draft.loading;

  // Limit the editor to specific top-level fields when `?fields=` is provided.
  const [visibleFields] = useArrayParam('fields');

  // Notify the parent window once the doc has finished loading.
  const readySentRef = useRef(false);
  useEffect(() => {
    if (loading || readySentRef.current) {
      return;
    }
    readySentRef.current = true;
    postToParent({type: 'ready', docId});
  }, [loading, docId]);

  // Notify the parent window of save / publish lifecycle events.
  const lastPublishedAtRef = useRef<number>(0);
  useEffect(() => {
    const unsubscribers = [
      controller.onFlush(() => {
        postToParent({type: 'saved', docId, saveState: SaveState.SAVED});
      }),
      controller.onChange((data: CMSDoc) => {
        const publishedAt = toMillis(data?.sys?.publishedAt);
        // Seed the baseline on first load so we only emit on subsequent
        // publishes, not for the doc's pre-existing published state.
        if (lastPublishedAtRef.current === 0) {
          lastPublishedAtRef.current = publishedAt;
          return;
        }
        if (publishedAt > lastPublishedAtRef.current) {
          lastPublishedAtRef.current = publishedAt;
          postToParent({type: 'published', docId, publishedAt});
        }
      }),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [controller, docId]);

  return (
    // The `DocumentPage__side` class is reused so that scrollToDeeplink()
    // (which targets `.DocumentPage__side` as its scroll container) keeps
    // working for the headless editor.
    <div
      className={joinClassNames('EmbeddedDocumentPage', 'DocumentPage__side')}
    >
      <DocEditor docId={docId} visibleFields={visibleFields} />
    </div>
  );
}
