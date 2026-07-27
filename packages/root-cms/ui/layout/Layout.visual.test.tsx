import '../styles/global.css';
import '../styles/theme.css';
import {MantineProvider} from '@mantine/core';
import {render} from '@testing-library/preact';
import {LocationProvider} from 'preact-iso';
import {describe, it, beforeEach, expect} from 'vitest';
import {Layout} from './Layout.js';

describe('Layout', () => {
  beforeEach(() => {
    window.localStorage.clear();
    (window as any).__ROOT_CTX = {
      rootConfig: {projectId: 'test', projectName: 'Test Project'},
      experiments: {},
      sidebar: {},
    };
    (window as any).firebase = {
      user: {email: 'someone@example.com', photoURL: ''},
      auth: {signOut: async () => {}},
    };
  });

  function renderLayout() {
    return render(
      <MantineProvider>
        <LocationProvider>
          <Layout>
            <div>content</div>
          </Layout>
        </LocationProvider>
      </MantineProvider>
    );
  }

  it('collapses the sidebar by default', async () => {
    const {container} = renderLayout();
    expect(container.querySelector('.Layout--sidebar-expanded')).toBeNull();
    expect(container.querySelector('.Layout__side__button__label')).toBeNull();
  });

  it('shows sidebar labels when expanded', async () => {
    const {container} = renderLayout();
    const toggle = container.querySelector(
      '.Layout__side__toggle__button'
    ) as HTMLElement;
    toggle.click();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(container.querySelector('.Layout--sidebar-expanded')).not.toBeNull();
    const labels = Array.from(
      container.querySelectorAll('.Layout__side__button__label')
    ).map((el) => el.textContent);
    expect(labels).toContain('Home');
    expect(labels).toContain('Content');
    expect(labels).toContain('Settings');
  });

  it('does not overflow the page when the viewport is short', async () => {
    const {container} = renderLayout();
    const side = container.querySelector('.Layout__side') as HTMLElement;
    expect(side.getBoundingClientRect().height).toBeLessThanOrEqual(
      window.innerHeight
    );
    // The list of links scrolls within the sidebar instead of overflowing it.
    const buttons = container.querySelector(
      '.Layout__side__buttons'
    ) as HTMLElement;
    expect(buttons.clientHeight).toBeLessThanOrEqual(
      side.getBoundingClientRect().height
    );
  });
});
