interface HighlightNodeOptions {
  scroll: boolean;
}

/** Sends a request to the preview iframe to highlight a node. */
export function requestHighlightNode(
  deepKey: string | null,
  options?: HighlightNodeOptions
) {
  const iframeEl = getIframePreviewElement();
  if (!iframeEl) {
    return;
  }
  iframeEl.contentWindow?.postMessage({highlightNode: {deepKey, options}}, '*');
}

function getIframePreviewElement(): HTMLIFrameElement | null {
  return document.querySelector('iframe[title="iframe preview"]');
}
