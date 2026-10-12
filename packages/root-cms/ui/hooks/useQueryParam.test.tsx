import {render} from '@testing-library/preact';
import {LocationProvider} from 'preact-iso';
import {describe, expect, it, beforeEach} from 'vitest';
import {useArrayParam, useStringParam} from './useQueryParam.js';

describe('useQueryParam', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
  });

  it('multiple useArrayParam hooks together do not loop', async () => {
    let renderCount = 0;

    function TestComponent() {
      renderCount++;
      const [locales] = useArrayParam('locales', []);
      const [tags] = useArrayParam('tags', []);
      const [query] = useStringParam('q', '');
      return (
        <div data-testid="result">
          {locales.length},{tags.length},{query}
        </div>
      );
    }

    render(
      <LocationProvider>
        <TestComponent />
      </LocationProvider>
    );

    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(renderCount).toBeLessThan(10);
  });
});
