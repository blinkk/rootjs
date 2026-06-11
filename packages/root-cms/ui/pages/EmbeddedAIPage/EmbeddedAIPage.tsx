import './EmbeddedAIPage.css';

import {useEffect, useRef} from 'preact/hooks';
import {RootAIChat} from '../../components/RootAIChat/RootAIChat.js';
import {usePageTitle} from '../../hooks/usePageTitle.js';
import {useStringParam} from '../../hooks/useQueryParam.js';
import {postToParent} from '../../utils/embed-bridge.js';

/**
 * Headless ("embedded") version of the Root AI chat, intended to be loaded
 * inside an iframe / pop-up by a client previewing a page. Behaves like the
 * Root AI side panel on the document page: the compact `panel` variant with
 * no chat history sidebar and a fresh chat per load.
 *
 * An optional `?docId=` query param (e.g. `?docId=Pages/about`) tells the AI
 * which document the user is editing. Unlike the document page panel, there
 * is no close button -- dismissing the iframe/pop-up is up to the embedding
 * page.
 */
export function EmbeddedAIPage() {
  usePageTitle('Root AI');
  const [docId] = useStringParam('docId');

  // Notify the parent window once mounted.
  const readySentRef = useRef(false);
  useEffect(() => {
    if (readySentRef.current) {
      return;
    }
    readySentRef.current = true;
    postToParent({type: 'ready', docId: docId || undefined});
  }, [docId]);

  return (
    <div className="EmbeddedAIPage">
      <RootAIChat variant="panel" docContext={docId ? {docId} : undefined} />
    </div>
  );
}
