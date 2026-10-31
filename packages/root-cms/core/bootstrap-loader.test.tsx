import {renderToString} from 'preact-render-to-string';
import {describe, expect, it} from 'vitest';
import {BOOTSTRAP_LOADERS, pickBootstrapLoader} from './bootstrap-loader.js';

describe('pickBootstrapLoader', () => {
  it('can pick every loader', () => {
    const count = BOOTSTRAP_LOADERS.length;
    const picked = BOOTSTRAP_LOADERS.map((_, i) =>
      pickBootstrapLoader(() => i / count)
    );
    expect(picked).toEqual(BOOTSTRAP_LOADERS);
  });

  it('stays in range at the top of the random range', () => {
    const last = BOOTSTRAP_LOADERS[BOOTSTRAP_LOADERS.length - 1];
    expect(pickBootstrapLoader(() => 0.999999)).toBe(last);
  });
});

describe('BOOTSTRAP_LOADERS', () => {
  it.each(BOOTSTRAP_LOADERS.map((loader) => [loader.id, loader] as const))(
    '%s renders its modifier class and scoped styles',
    (id, loader) => {
      const {Loader, css} = loader;
      const html = renderToString(<Loader />);
      expect(html).toContain(`bootstrap-beet--${id}`);
      expect(html).toContain('aria-hidden');
      expect(css).toContain(`.bootstrap-beet--${id} `);
      expect(css).toContain('prefers-reduced-motion');
    }
  );
});
