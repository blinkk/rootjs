import '../../styles/tailwind.out.css';
import '../../styles/global.css';
import '../../styles/theme.css';

import {cleanup, render} from '@testing-library/preact';
import axe from 'axe-core';
import {afterEach, describe, expect, it} from 'vitest';
import {page} from 'vitest/browser';
import type {GalleryEntry} from './types.js';

/** The viewports every story is checked at: a phone and a desktop. */
const VIEWPORTS = [
  {name: 'mobile', width: 375, height: 812},
  {name: 'desktop', width: 1280, height: 800},
];

/**
 * Runs a visual and accessibility test for every story of a gallery entry,
 * at each viewport. Call it from the component's `<Name>.visual.test.tsx`:
 *
 * ```tsx
 * import {testGallery} from '../../dev/gallery/testGallery.js';
 * import {ButtonGallery} from './Button.gallery.js';
 *
 * testGallery(ButtonGallery);
 * ```
 *
 * Goldens are written to a colocated `__screenshots__/` on the first run;
 * update them with `pnpm test:visual --update`.
 */
export function testGallery(entry: GalleryEntry) {
  describe(`${entry.name} gallery`, () => {
    afterEach(() => cleanup());

    for (const [story, renderStory] of Object.entries(entry.stories)) {
      for (const viewport of VIEWPORTS) {
        it(`${story} (${viewport.name})`, async () => {
          await page.viewport(viewport.width, viewport.height);
          const {container} = render(
            <main className="bg-page p-4 text-fg" data-testid="story">
              {renderStory()}
            </main>
          );

          const results = await axe.run(container);
          expect(formatViolations(results.violations)).toEqual([]);

          await expect
            .element(page.getByTestId('story'))
            .toMatchScreenshot(
              `${entry.id}-${slugify(story)}-${viewport.name}.png`
            );
        });
      }
    }
  });
}

/** Summarizes axe violations so a failing test reads as a short list. */
function formatViolations(violations: axe.Result[]): string[] {
  return violations.flatMap((violation) =>
    violation.nodes.map(
      (node) => `${violation.id}: ${node.target.join(' ')} — ${violation.help}`
    )
  );
}

function slugify(str: string) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
