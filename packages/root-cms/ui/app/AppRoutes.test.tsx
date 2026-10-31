import {describe, expect, it, vi} from 'vitest';

vi.hoisted(() => {
  (window as any).__ROOT_CTX = {build: {}};
});

const {preloadRoute} = await import('./AppRoutes.js');

describe('preloadRoute', () => {
  it('does not throw on a url the router cannot decode', () => {
    // This runs at the top level of main.tsx, where throwing would leave the
    // app stuck on its loading screen.
    expect(() => preloadRoute('/cms/content/Pages/100%')).not.toThrow();
  });
});
