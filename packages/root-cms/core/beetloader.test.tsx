import {renderToString} from 'preact-render-to-string';
import {describe, expect, it} from 'vitest';
import {BEETLOADERS, pickBeetloader} from './beetloader.js';

describe('pickBeetloader', () => {
  it('can pick every beetloader', () => {
    const count = BEETLOADERS.length;
    const picked = BEETLOADERS.map((_, i) => pickBeetloader(() => i / count));
    expect(picked).toEqual(BEETLOADERS);
  });

  it('stays in range at the top of the random range', () => {
    const last = BEETLOADERS[BEETLOADERS.length - 1];
    expect(pickBeetloader(() => 0.999999)).toBe(last);
  });
});

describe('BEETLOADERS', () => {
  it.each(
    BEETLOADERS.map((beetloader) => [beetloader.id, beetloader] as const)
  )('%s renders its modifier class and scoped styles', (id, beetloader) => {
    const {Component, css} = beetloader;
    const html = renderToString(<Component />);
    expect(html).toContain(`beetloader--${id}`);
    expect(html).toContain('aria-hidden');
    expect(css).toContain(`.beetloader--${id} `);
    expect(css).toContain('prefers-reduced-motion');
  });
});
