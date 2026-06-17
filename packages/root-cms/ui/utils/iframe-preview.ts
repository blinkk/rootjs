import {HighlightNodeMessage} from '../../shared/embed-protocol.js';

interface HighlightNodeOptions {
  /** Whether to scroll to the element in the preview. */
  scroll: boolean;
}

/** Sends a request to the preview iframe(s) to highlight a node. */
export function requestHighlightNode(
  deepKey: string | null,
  options?: HighlightNodeOptions
) {
  if (!testEnableChannelToPreview()) {
    return;
  }
  const iframeEls = getIframePreviewElements();
  if (iframeEls.length === 0) {
    return;
  }
  const message: HighlightNodeMessage = {highlightNode: {deepKey, options}};
  // The preview iframe is same-origin (preview URLs are relative paths served
  // by the same root server). When multiple viewports are shown (2-up), the
  // node is highlighted in every preview.
  iframeEls.forEach((iframeEl) => {
    iframeEl.contentWindow?.postMessage(message, window.location.origin);
  });
}

/** Returns the iframe elements used for previewing content. */
function getIframePreviewElements(): HTMLIFrameElement[] {
  return Array.from(
    document.querySelectorAll('iframe[title="iframe preview"]')
  );
}

/** Returns whether the channel to the preview should be enabled. */
function testEnableChannelToPreview() {
  const previewOptions = window.__ROOT_CTX.preview || {};
  return [true, 'to-preview'].includes(previewOptions.channel);
}
