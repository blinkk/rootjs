/** Sends a request to the preview iframe to target a node. */
export function targetNode(deepKey: string | null) {
  const iframeEl = getIframePreviewElement();
  if (!iframeEl) {
    return;
  }
  iframeEl.contentWindow?.postMessage({targetNode: {deepKey}}, '*');
}

function getIframePreviewElement(): HTMLIFrameElement | null {
  return document.querySelector('iframe[title="iframe preview"]');
}
