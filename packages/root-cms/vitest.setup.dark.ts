/// <reference types="vite/client" />
import {beforeEach} from 'vitest';
import darkCss from './themes/dark.css?raw';

/**
 * Loads the built-in dark theme for `pnpm test:visual:dark`. It's moved to
 * the end of the head before each test, after the stylesheets the test file
 * imports, as the CMS loads a theme after its own CSS.
 */
beforeEach(() => {
  let style = document.getElementById('root-cms-theme');
  if (!style) {
    style = document.createElement('style');
    style.id = 'root-cms-theme';
    style.textContent = darkCss;
  }
  document.head.appendChild(style);
});
