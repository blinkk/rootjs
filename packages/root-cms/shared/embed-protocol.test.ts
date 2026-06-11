import {describe, it, expect} from 'vitest';
import {
  isHighlightNodeMessage,
  isRootEmbedMessage,
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
