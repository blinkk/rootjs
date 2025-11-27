# Visual Testing in Root CMS

We use [Vitest Browser Mode](https://vitest.dev/guide/browser.html) with
[Playwright](https://playwright.dev/) to run visual regression tests.

## Running Tests

To run the visual tests, use the following command:

```bash
pnpm test:visual
```

This will run the tests in a headless Chromium browser.

## Writing Tests

Visual tests should be placed in files ending with `.visual.test.tsx`.

Example:

```tsx
import {describe, it, expect} from 'vitest';
import {render} from '@testing-library/preact';
import {page} from 'vitest/browser';
import {MyComponent} from './MyComponent';

describe('MyComponent', () => {
  it('renders correctly', async () => {
    render(<MyComponent />);
    const element = page.getByText('Hello World');
    await expect.element(element).toBeVisible();
    await expect.element(element).toMatchScreenshot('my-component.png');
  });
});
```

## Updating Snapshots

If you make intentional changes to the UI, the visual tests will fail. To update
the golden screenshots, run the following command:

```bash
pnpm test:visual --update
```

During development of a new feature, use the `--update` flag to automatically
update the golden screenshots.

## Troubleshooting

If you encounter issues with missing matchers, ensure `vitest.setup.ts` is
correctly loaded.
