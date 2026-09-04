import {describe, it, expect} from 'vitest';
import {
  isHighlightNodeMessage,
  isNavigateToDocMessage,
  isRootEmbedMessage,
  isRootToolLocationMessage,
  isScrollToDeeplinkMessage,
} from './embed-protocol.js';

describe('isRootEmbedMessage', () => {
  it('accepts lifecycle messages', () => {
    expect(isRootEmbedMessage({root: {type: 'ready'}})).toBe(true);
    expect(isRootEmbedMessage({root: {type: 'saved', docId: 'Pages/a'}})).toBe(
      true
    );
    expect(
      isRootEmbedMessage({root: {type: 'published', publishedAt: 123}})
    ).toBe(true);
    expect(isRootEmbedMessage({root: {type: 'error', error: 'oops'}})).toBe(
      true
    );
  });

  it('rejects malformed payloads', () => {
    expect(isRootEmbedMessage(null)).toBe(false);
    expect(isRootEmbedMessage(undefined)).toBe(false);
    expect(isRootEmbedMessage('ready')).toBe(false);
    expect(isRootEmbedMessage({})).toBe(false);
    expect(isRootEmbedMessage({root: null})).toBe(false);
    expect(isRootEmbedMessage({root: 'ready'})).toBe(false);
    expect(isRootEmbedMessage({root: {type: 'unknown'}})).toBe(false);
    expect(isRootEmbedMessage({scrollToDeeplink: {deepKey: 'a'}})).toBe(false);
  });
});

describe('isScrollToDeeplinkMessage', () => {
  it('accepts scrollToDeeplink messages', () => {
    expect(
      isScrollToDeeplinkMessage({scrollToDeeplink: {deepKey: 'hero.title'}})
    ).toBe(true);
  });

  it('rejects malformed payloads', () => {
    expect(isScrollToDeeplinkMessage(null)).toBe(false);
    expect(isScrollToDeeplinkMessage({})).toBe(false);
    expect(isScrollToDeeplinkMessage({scrollToDeeplink: null})).toBe(false);
    expect(isScrollToDeeplinkMessage({scrollToDeeplink: {}})).toBe(false);
    expect(isScrollToDeeplinkMessage({scrollToDeeplink: {deepKey: 1}})).toBe(
      false
    );
    expect(isScrollToDeeplinkMessage({root: {type: 'ready'}})).toBe(false);
  });
});

describe('isRootToolLocationMessage', () => {
  it('accepts locationchange messages', () => {
    expect(
      isRootToolLocationMessage({
        rootTool: {type: 'locationchange', url: '/foo?a=1#h'},
      })
    ).toBe(true);
  });

  it('rejects malformed payloads', () => {
    expect(isRootToolLocationMessage(null)).toBe(false);
    expect(isRootToolLocationMessage({})).toBe(false);
    expect(isRootToolLocationMessage({rootTool: null})).toBe(false);
    expect(isRootToolLocationMessage({rootTool: {}})).toBe(false);
    expect(
      isRootToolLocationMessage({rootTool: {type: 'locationchange'}})
    ).toBe(false);
    expect(
      isRootToolLocationMessage({rootTool: {type: 'other', url: '/foo'}})
    ).toBe(false);
    expect(
      isRootToolLocationMessage({rootTool: {type: 'locationchange', url: 1}})
    ).toBe(false);
  });
});

describe('isHighlightNodeMessage', () => {
  it('accepts highlightNode messages', () => {
    expect(
      isHighlightNodeMessage({highlightNode: {deepKey: 'hero.title'}})
    ).toBe(true);
    expect(
      isHighlightNodeMessage({
        highlightNode: {deepKey: 'hero.title', options: {scroll: true}},
      })
    ).toBe(true);
    // A null deepKey clears highlights.
    expect(isHighlightNodeMessage({highlightNode: {deepKey: null}})).toBe(true);
  });

  it('rejects malformed payloads', () => {
    expect(isHighlightNodeMessage(null)).toBe(false);
    expect(isHighlightNodeMessage({})).toBe(false);
    expect(isHighlightNodeMessage({highlightNode: null})).toBe(false);
    expect(isHighlightNodeMessage({highlightNode: {}})).toBe(false);
    expect(isHighlightNodeMessage({highlightNode: {deepKey: 1}})).toBe(false);
  });
});

describe('isNavigateToDocMessage', () => {
  it('accepts a doc id, with or without an explicit confirm flag', () => {
    expect(
      isNavigateToDocMessage({navigateToDoc: {docId: 'Pages/about'}})
    ).toBe(true);
    expect(
      isNavigateToDocMessage({
        navigateToDoc: {docId: 'Pages/about', confirm: false},
      })
    ).toBe(true);
  });

  it('rejects malformed payloads', () => {
    expect(isNavigateToDocMessage({navigateToDoc: {}})).toBe(false);
    expect(isNavigateToDocMessage({navigateToDoc: {docId: 42}})).toBe(false);
    expect(
      isNavigateToDocMessage({
        navigateToDoc: {docId: 'Pages/a', confirm: 'yes'},
      })
    ).toBe(false);
    expect(isNavigateToDocMessage({navigateToDoc: null})).toBe(false);
    expect(isNavigateToDocMessage({})).toBe(false);
    expect(isNavigateToDocMessage(null)).toBe(false);
    expect(isNavigateToDocMessage('navigateToDoc')).toBe(false);
  });

  // The un-namespaced messages share a channel, so they must stay distinct.
  it('does not match the other message types', () => {
    expect(
      isNavigateToDocMessage({scrollToDeeplink: {deepKey: 'hero.title'}})
    ).toBe(false);
    expect(isNavigateToDocMessage({highlightNode: {deepKey: null}})).toBe(
      false
    );
    expect(isScrollToDeeplinkMessage({navigateToDoc: {docId: 'Pages/a'}})).toBe(
      false
    );
    expect(isHighlightNodeMessage({navigateToDoc: {docId: 'Pages/a'}})).toBe(
      false
    );
  });
});
