import '../styles/global.css';
import '../styles/mantine.css';
import '../styles/theme.css';
import {MantineProvider} from '@mantine/core';
import {fireEvent, render, waitFor} from '@testing-library/preact';
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

  it('keeps the sidebar icons in place when toggled', async () => {
    const {container} = renderLayout();
    const iconPositions = () =>
      Array.from(
        container.querySelectorAll(
          '.Layout__side__button__icon, .Layout__side__toggle__icon, .Layout__side__user__button'
        )
      ).map((el) => el.getBoundingClientRect().left);
    const collapsed = iconPositions();
    expect(collapsed.length).toBeGreaterThan(1);
    const toggle = container.querySelector(
      '.Layout__side__toggle__button'
    ) as HTMLElement;
    toggle.click();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(iconPositions()).toEqual(collapsed);
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

  it('does not add a build tooltip to the version when not prebuilt', async () => {
    const {container} = renderLayout();
    expect(container.querySelector('.Layout__top__version')).not.toBeNull();
    expect(
      container.querySelector('.Layout__top__version__tooltip')
    ).toBeNull();
  });

  it('shows the build timestamp on hover when the app is prebuilt', async () => {
    (window as any).__ROOT_CTX.build = {
      timestamp: new Date('2026-07-27T12:00:00Z').getTime(),
    };
    const {container} = renderLayout();
    const tooltip = container.querySelector(
      '.Layout__top__version__tooltip'
    ) as HTMLElement;
    expect(tooltip).not.toBeNull();
    fireEvent.pointerEnter(tooltip);
    const label = await waitFor(() => {
      const el = document.querySelector('.mantine-Tooltip-body');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(label.textContent).toMatch(/^Built .*2026/);
  });
});
