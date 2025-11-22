import '../../styles/global.css';
import '../../styles/theme.css';
import './DocumentPagePreviewBar.css';
import {MantineProvider} from '@mantine/core';
import {render} from '@testing-library/preact';
import {describe, it, expect} from 'vitest';
import {page} from 'vitest/browser';
import {DocumentPagePreviewBar} from './DocumentPagePreviewBar.js';

describe('DocumentPagePreviewBar', () => {
  const mockLocaleOptions = [
    {value: '', label: 'Select locale'},
    {value: 'en_US', label: 'English (en_US)'},
    {value: 'es_ES', label: 'Spanish (es_ES)'},
    {value: 'fr_FR', label: 'French (fr_FR)'},
  ];

  it('renders preview bar at large viewport with tablet selected', async () => {
    page.viewport(1200, 800);

    render(
      <MantineProvider>
        <div data-testid="preview-bar-large">
          <DocumentPagePreviewBar
            device="tablet"
            expandVertically={false}
            iframeUrl="https://example.com/blog/my-awesome-post"
            localeOptions={mockLocaleOptions}
            selectedLocale="en_US"
            onToggleDevice={() => {}}
            onToggleExpandVertically={() => {}}
            onReloadClick={() => {}}
            onOpenNewTab={() => {}}
            onLocaleChange={() => {}}
          />
        </div>
      </MantineProvider>
    );

    const element = page.getByTestId('preview-bar-large');
    await expect.element(element).toBeVisible();
    await expect
      .element(element)
      .toMatchScreenshot('document-page-preview-bar-large.png');
  });

  it('renders preview bar at small viewport', async () => {
    page.viewport(640, 480);

    render(
      <MantineProvider>
        <div data-testid="preview-bar-small">
          <DocumentPagePreviewBar
            device="mobile"
            expandVertically={false}
            iframeUrl="https://example.com/products/item-12345"
            localeOptions={mockLocaleOptions}
            selectedLocale=""
            onToggleDevice={() => {}}
            onToggleExpandVertically={() => {}}
            onReloadClick={() => {}}
            onOpenNewTab={() => {}}
            onLocaleChange={() => {}}
          />
        </div>
      </MantineProvider>
    );

    const element = page.getByTestId('preview-bar-small');
    await expect.element(element).toBeVisible();
    await expect
      .element(element)
      .toMatchScreenshot('document-page-preview-bar-small.png');
  });

  it('renders preview bar with no device selected at large viewport', async () => {
    page.viewport(1200, 800);

    render(
      <MantineProvider>
        <div data-testid="preview-bar-no-device">
          <DocumentPagePreviewBar
            device=""
            expandVertically={false}
            iframeUrl="https://example.com/pages/about-us"
            localeOptions={mockLocaleOptions}
            selectedLocale="es_ES"
            onToggleDevice={() => {}}
            onToggleExpandVertically={() => {}}
            onReloadClick={() => {}}
            onOpenNewTab={() => {}}
            onLocaleChange={() => {}}
          />
        </div>
      </MantineProvider>
    );

    const element = page.getByTestId('preview-bar-no-device');
    await expect.element(element).toBeVisible();
    await expect
      .element(element)
      .toMatchScreenshot('document-page-preview-bar-no-device.png');
  });

  it('renders preview bar with desktop and vertical expand active', async () => {
    page.viewport(1200, 800);

    render(
      <MantineProvider>
        <div data-testid="preview-bar-expand-active">
          <DocumentPagePreviewBar
            device="desktop"
            expandVertically={true}
            iframeUrl="https://example.com/documentation/getting-started"
            localeOptions={mockLocaleOptions}
            selectedLocale="fr_FR"
            onToggleDevice={() => {}}
            onToggleExpandVertically={() => {}}
            onReloadClick={() => {}}
            onOpenNewTab={() => {}}
            onLocaleChange={() => {}}
          />
        </div>
      </MantineProvider>
    );

    const element = page.getByTestId('preview-bar-expand-active');
    await expect.element(element).toBeVisible();
    await expect
      .element(element)
      .toMatchScreenshot('document-page-preview-bar-expand-active.png');
  });
});
