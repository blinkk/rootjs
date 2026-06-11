import './EmbeddedDocumentPage.css';

import {Button} from '@mantine/core';
import {IconDeviceFloppy} from '@tabler/icons-preact';
import {useEffect, useRef, useState} from 'preact/hooks';
import {DocEditor} from '../../components/DocEditor/DocEditor.js';
import {
  DraftDocProvider,
  SaveState,
  useDraftDoc,
  useDraftDocSaveState,
} from '../../hooks/useDraftDoc.js';
import {usePageTitle} from '../../hooks/usePageTitle.js';
import {useProjectRoles} from '../../hooks/useProjectRoles.js';
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
 * Renders only the `DocEditor` fields (no status bar, top nav, sidebar,
 * side-by-side preview, or Checks/Search/AI panels) plus a save bar. Saving is
 * explicit: autosave is disabled and changes are only persisted when the user
 * clicks "Save"; pending changes are discarded when the iframe/pop-up is
 * closed without saving. A `postMessage` bridge notifies the parent window of
 * editor lifecycle events (`ready`, `saved`, `published`). Field focus
 * ("click to edit") works via the existing `DeeplinkProvider` (`?deeplink=`
 * and inbound `scrollToDeeplink` messages).
 */
export function EmbeddedDocumentPage(props: EmbeddedDocumentPageProps) {
  const docId = `${props.collection}/${props.slug}`;
  const {roles} = useProjectRoles();
  const currentUserEmail = window.firebase.user.email || '';
  const canEdit = testCanEdit(roles, currentUserEmail);
  return (
    <DraftDocProvider
      docId={docId}
      readOnly={!canEdit}
      autoSave={false}
      flushOnStop={false}
    >
      <EmbeddedDocumentPageInner {...props} canEdit={canEdit} />
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

function EmbeddedDocumentPageInner(
  props: EmbeddedDocumentPageProps & {canEdit: boolean}
) {
  const docId = `${props.collection}/${props.slug}`;
  usePageTitle(docId);
  const draft = useDraftDoc();
  const controller = draft.controller;
  const loading = draft.loading;

  const [saveState, setSaveState] = useState<SaveState>(SaveState.NO_CHANGES);
  useDraftDocSaveState(setSaveState);

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
    <div className="EmbeddedDocumentPage">
      {/*
        The `DocumentPage__side` class is reused so that scrollToDeeplink()
        (which targets `.DocumentPage__side` as its scroll container) keeps
        working for the headless editor.
      */}
      {props.canEdit && !loading && (
        <div className="EmbeddedDocumentPage__saveBar">
          <Button
            component="a"
            className="EmbeddedDocumentPage__saveBar__docId"
            href={`/cms/content/${props.collection}/${props.slug}`}
            target="_blank"
            rel="noreferrer noopener"
            title="Open in new tab"
            compact
            size="xs"
            variant="default"
          >
            {docId}
          </Button>
          <div className="EmbeddedDocumentPage__saveBar__controls">
            <div className="EmbeddedDocumentPage__saveBar__saveState">
              {saveState === SaveState.UPDATES_PENDING && 'unsaved changes'}
              {saveState === SaveState.SAVED && 'saved!'}
              {saveState === SaveState.ERROR && 'error saving'}
            </div>
            <Button
              color="dark"
              compact
              size="xs"
              leftIcon={<IconDeviceFloppy size={16} />}
              loading={saveState === SaveState.SAVING}
              disabled={
                saveState !== SaveState.UPDATES_PENDING &&
                saveState !== SaveState.ERROR
              }
              onClick={() => controller.flush()}
            >
              Save
            </Button>
          </div>
        </div>
      )}
      <div
        className={joinClassNames(
          'EmbeddedDocumentPage__editor',
          'DocumentPage__side'
        )}
      >
        <DocEditor docId={docId} hideStatusBar />
      </div>
    </div>
  );
}
