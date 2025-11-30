import {render} from '@testing-library/preact';
import {describe, it, expect, vi} from 'vitest';
import {page} from 'vitest/browser';
import {GenerateImageForm} from './GenerateImageForm.js';

describe('GenerateImageForm', () => {
  it('renders simple mode by default', async () => {
    page.viewport(600, 600);
    render(
      <div style={{padding: '20px', width: '400px'}} data-testid="wrapper">
        <GenerateImageForm onSubmit={vi.fn()} />
      </div>
    );

    const element = page.getByTestId('wrapper');
    await expect.element(element).toBeVisible();
    await expect
      .element(element)
      .toMatchScreenshot('generate-image-form-simple.png');
  });

  it('renders AI mode when selected', async () => {
    // Enable AI experiment
    (window as any).__ROOT_CTX = {
      experiments: {
        ai: true,
      },
      rootConfig: {
        projectId: 'test-project',
      },
    };

    page.viewport(600, 600);
    render(
      <div style={{padding: '20px', width: '400px'}} data-testid="wrapper-ai">
        <GenerateImageForm onSubmit={vi.fn()} />
      </div>
    );

    const element = page.getByTestId('wrapper-ai');
    await expect.element(element).toBeVisible();

    // Verify control is present
    const simpleSegment = page.getByText('Simple');
    await expect.element(simpleSegment).toBeVisible();

    // Switch to AI mode
    const aiSegment = page.getByText('Generate with AI');
    await aiSegment.click();

    // Verify Aspect Ratio select is present
    const aspectRatioSelect = page.getByText('Aspect Ratio');
    await expect.element(aspectRatioSelect).toBeVisible();

    // Verify Save button is disabled initially
    const saveButton = page.getByRole('button', {name: 'Save'});
    await expect.element(saveButton).toBeDisabled();

    await expect
      .element(element)
      .toMatchScreenshot('generate-image-form-ai.png');
  });
});
