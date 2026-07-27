import {describe, expect, it} from 'vitest';
import {
  getPreviewPathFromUrlKey,
  getPreviewSrcFromUrlKey,
  getPreviewSyncUpdate,
  getPreviewUrlKey,
  getPreviewUrlKeyFromUrl,
  type PreviewPaneState,
} from './preview-url-sync.js';

function pane(
  slot: number,
  urlKey: string | null,
  lastUrlKey: string | null
): PreviewPaneState {
  return {slot, urlKey, lastUrlKey};
}

describe('getPreviewUrlKey', () => {
  it('strips the preview param', () => {
    expect(
      getPreviewUrlKey({pathname: '/about', search: '?preview=true', hash: ''})
    ).toBe('/about');
  });

  it('preserves other query params and the hash', () => {
    expect(
      getPreviewUrlKey({
        pathname: '/about',
        search: '?preview=true&debug=1',
        hash: '#team',
      })
    ).toBe('/about?debug=1#team');
  });

  it('handles locations with no search or hash', () => {
    expect(getPreviewUrlKey({pathname: '/', search: '', hash: ''})).toBe('/');
  });
});

describe('getPreviewUrlKeyFromUrl', () => {
  it('returns the key for a relative url', () => {
    expect(getPreviewUrlKeyFromUrl('/about?preview=true#team')).toBe(
      '/about#team'
    );
  });

  it('returns the key for a same-origin absolute url', () => {
    const url = `${window.location.origin}/about?preview=true`;
    expect(getPreviewUrlKeyFromUrl(url)).toBe('/about');
  });

  it('returns null for about:blank', () => {
    expect(getPreviewUrlKeyFromUrl('about:blank')).toBe(null);
  });

  it('returns null for empty and cross-origin urls', () => {
    expect(getPreviewUrlKeyFromUrl('')).toBe(null);
    expect(getPreviewUrlKeyFromUrl('https://example.com/about')).toBe(null);
  });
});

describe('getPreviewSrcFromUrlKey', () => {
  it('re-adds the preview param', () => {
    expect(getPreviewSrcFromUrlKey('/about')).toBe('/about?preview=true');
  });

  it('preserves other params and the hash', () => {
    expect(getPreviewSrcFromUrlKey('/about?debug=1#team')).toBe(
      '/about?debug=1&preview=true#team'
    );
  });
});

describe('getPreviewPathFromUrlKey', () => {
  it('drops the search params and hash', () => {
    expect(getPreviewPathFromUrlKey('/about?debug=1#team')).toBe('/about');
    expect(getPreviewPathFromUrlKey('/about#team')).toBe('/about');
    expect(getPreviewPathFromUrlKey('/about')).toBe('/about');
  });
});

describe('getPreviewSyncUpdate', () => {
  it('returns null when no pane has changed', () => {
    const panes = [pane(0, '/about', '/about'), pane(1, '/about', '/about')];
    expect(getPreviewSyncUpdate(panes)).toBe(null);
  });

  it('mirrors a navigation to the other panes', () => {
    const panes = [pane(0, '/contact', '/about'), pane(1, '/about', '/about')];
    expect(getPreviewSyncUpdate(panes)).toEqual({
      urlKey: '/contact',
      slots: [1],
    });
  });

  it('mirrors a navigation from any pane to all other panes', () => {
    const panes = [
      pane(0, '/about', '/about'),
      pane(1, '/contact', '/about'),
      pane(2, '/about', '/about'),
    ];
    expect(getPreviewSyncUpdate(panes)).toEqual({
      urlKey: '/contact',
      slots: [0, 2],
    });
  });

  it('mirrors hash-only changes', () => {
    const panes = [
      pane(0, '/about#team', '/about'),
      pane(1, '/about', '/about'),
    ];
    expect(getPreviewSyncUpdate(panes)).toEqual({
      urlKey: '/about#team',
      slots: [1],
    });
  });

  it('navigates panes whose location cannot be read', () => {
    const panes = [pane(0, '/contact', '/about'), pane(1, null, '/about')];
    expect(getPreviewSyncUpdate(panes)).toEqual({
      urlKey: '/contact',
      slots: [1],
    });
  });

  it('ignores unreadable panes as the source of a change', () => {
    const panes = [pane(0, null, '/about'), pane(1, '/about', '/about')];
    expect(getPreviewSyncUpdate(panes)).toBe(null);
  });

  it('skips panes already sent to the new url', () => {
    // Pane 1 is mid-load of the url pane 0 just navigated to, so it shouldn't
    // be navigated again.
    const panes = [pane(0, '/contact', '/about'), pane(1, null, '/contact')];
    expect(getPreviewSyncUpdate(panes)).toEqual({
      urlKey: '/contact',
      slots: [],
    });
  });

  it('skips panes already showing the new url', () => {
    // Both panes loaded the same url for the first time.
    const panes = [pane(0, '/about', null), pane(1, '/about', null)];
    expect(getPreviewSyncUpdate(panes)).toEqual({urlKey: '/about', slots: []});
  });

  it('handles a single pane', () => {
    expect(getPreviewSyncUpdate([pane(0, '/contact', '/about')])).toEqual({
      urlKey: '/contact',
      slots: [],
    });
  });

  it('handles no panes', () => {
    expect(getPreviewSyncUpdate([])).toBe(null);
  });
});
