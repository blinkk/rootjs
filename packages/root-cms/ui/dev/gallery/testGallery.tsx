import '../../styles/tailwind.out.css';
import '../../styles/global.css';
import '../../styles/theme.css';

import {cleanup, render} from '@testing-library/preact';
import axe from 'axe-core';
import {afterEach, beforeAll, describe, expect, it} from 'vitest';
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
    beforeAll(() => freezeAnimations());
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

          const viewportMode = entry.screenshot === 'viewport';
          // Let effects run, so overlays that open on mount are in place.
          await new Promise((resolve) => requestAnimationFrame(resolve));
          const results = await axe.run(
            viewportMode ? document.body : container
          );
          expect(formatViolations(results.violations)).toEqual([]);

          const target = viewportMode
            ? page.elementLocator(document.body)
            : page.getByTestId('story');
          await expect
            .element(target)
            .toMatchScreenshot(
              `${entry.id}-${slugify(story)}-${viewport.name}.png`
            );
        });
      }
    }
  });
}

/** Stops animations and transitions, so screenshots are deterministic. */
function freezeAnimations() {
  const style = document.createElement('style');
  style.textContent =
    '*, *::before, *::after { animation: none !important; transition: none !important; }';
  document.head.appendChild(style);
}

/**
 * Buttons whose colors match the Mantine buttons they replace, which sit
 * below 4.5:1 contrast on purpose (see `--cms-button-*` in theme.css). Only
 * their `color-contrast` results are skipped; every other rule still runs.
 */
const MANTINE_COLOR_BUTTONS = [
  'blue',
  'blue-light',
  'green',
  'danger',
  'danger-outline',
  'danger-subtle',
]
  .flatMap((variant) => [
    `.Button--variant-${variant}`,
    `.IconButton--variant-${variant}`,
  ])
  .join(', ');

/** Whether an axe result is a known contrast exception. */
function isExpectedViolation(id: string, node: axe.NodeResult) {
  if (id !== 'color-contrast') {
    return false;
  }
  const el = document.querySelector(node.target.join(' '));
  return Boolean(el?.closest(MANTINE_COLOR_BUTTONS));
}

/** Summarizes axe violations so a failing test reads as a short list. */
function formatViolations(violations: axe.Result[]): string[] {
  return violations.flatMap((violation) =>
    violation.nodes
      .filter((node) => !isExpectedViolation(violation.id, node))
      .map(
        (node) =>
          `${violation.id}: ${node.target.join(' ')} — ${violation.help}`
      )
  );
}

function slugify(str: string) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
