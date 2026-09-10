import {act, cleanup, fireEvent, render, screen} from '@testing-library/preact';
import {LocationProvider} from 'preact-iso';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {DocSlugHit, GlobalSearchHit} from '../../hooks/useGlobalSearch.js';
import {GlobalSearch, openGlobalSearch} from './GlobalSearch.js';

const fieldHits: GlobalSearchHit[] = [];
const docSlugHits: DocSlugHit[] = [];

// Mantine components can't render under jsdom here (their hooks run outside
// the test's Preact instance), so the inner Spotlight is replaced with a
// minimal stand-in that honors the same props contract: a controlled input,
// the actions wrapper, and the action component.
vi.mock('@mantine/spotlight/esm/Spotlight/Spotlight.js', () => ({
  Spotlight: (props: any) => {
    if (!props.opened) {
      return null;
    }
    const Wrapper = props.actionsWrapperComponent;
    const Action = props.actionComponent;
    const actions = props
      .filter(props.query, props.actions)
      .slice(0, props.limit);
    return (
      <div className={props.classNames?.spotlight}>
        <input
          placeholder={props.searchPlaceholder}
          value={props.query}
          onInput={(e: any) => props.onQueryChange(e.currentTarget.value)}
          onKeyDown={(e: any) => {
            if (e.code === 'Escape') {
              props.onClose();
            }
          }}
        />
        <Wrapper>
          {actions.length > 0 ? (
            actions.map((action: any) => (
              <Action
                key={action.id}
                action={action}
                query={props.query}
                hovered={false}
                onTrigger={() => action.onTrigger(action)}
              />
            ))
          ) : (
            <div>{props.nothingFoundMessage}</div>
          )}
        </Wrapper>
      </div>
    );
  },
}));

vi.mock('../../hooks/useGlobalSearch.js', () => ({
  useGlobalSearch: () => ({
    hits: fieldHits,
    loading: false,
    error: null,
    status: null,
  }),
  useDocSlugSearch: () => ({hits: docSlugHits, loading: false}),
}));

vi.mock('../../hooks/usePendingReleases.js', () => ({
  usePendingReleases: () => ({releases: [], loading: false}),
}));

vi.mock('../../utils/data-source.js', () => ({
  listDataSources: () => Promise.resolve([]),
}));

function renderSearch() {
  return render(
    <LocationProvider>
      <GlobalSearch>
        <div>app</div>
      </GlobalSearch>
    </LocationProvider>
  );
}

function getInput(): HTMLInputElement {
  return screen.getByPlaceholderText(
    'Search docs, collections, releases…'
  ) as HTMLInputElement;
}

/** Finds a filter chip by label, e.g. `getChip('Documents')`. */
function getChip(label: string): HTMLButtonElement {
  const chips = Array.from(
    document.querySelectorAll<HTMLButtonElement>('.GlobalSearchFilters__chip')
  );
  const chip = chips.find(
    (el) => el.querySelector('span')?.textContent === label
  );
  if (!chip) {
    throw new Error(`chip not found: ${label}`);
  }
  return chip;
}

/** Returns the count badge of a filter chip, or null when it has none. */
function chipCount(label: string): string | null {
  return (
    getChip(label).querySelector('.GlobalSearchFilters__count')?.textContent ??
    null
  );
}

/** Returns true if a result group header (e.g. "Documents") is rendered. */
function hasHeader(label: string): boolean {
  return Array.from(
    document.querySelectorAll('.GlobalSearchAction--header')
  ).some((el) => el.textContent === label);
}

/** Flushes pending timers (URL sync debounce, close transition). */
async function flush() {
  await act(async () => {
    await vi.runAllTimersAsync();
  });
}

describe('GlobalSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    (window as any).__ROOT_CTX = {
      rootConfig: {projectId: 'test'},
      collections: {
        Pages: {name: 'Pages', description: 'Site pages'},
        Posts: {name: 'Posts'},
      },
    };
    fieldHits.length = 0;
    docSlugHits.length = 0;
    docSlugHits.push({collection: 'Pages', slug: 'home', docId: 'Pages/home'});
    fieldHits.push({
      id: 'Pages/home#fields.title',
      docId: 'Pages/home',
      collection: 'Pages',
      slug: 'home',
      deepKey: 'fields.title',
      fieldLabel: 'Title',
      fieldType: 'string',
      text: 'Welcome to pages',
      score: 1,
      terms: ['pages'],
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    window.history.replaceState({}, '', '/cms/');
  });

  it('stays closed when the URL has no search params', () => {
    window.history.replaceState({}, '', '/cms/');
    renderSearch();
    expect(
      screen.queryByPlaceholderText('Search docs, collections, releases…')
    ).toBeNull();
  });

  it('opens from a deep link with the query and filter prefilled', () => {
    window.history.replaceState({}, '', '/cms/?modal=search&q=pages&type=docs');
    renderSearch();
    expect(getInput().value).toBe('pages');
    expect(getChip('Documents').getAttribute('aria-pressed')).toBe('true');
    expect(getChip('All').getAttribute('aria-pressed')).toBe('false');
    // Only the "Documents" group is shown.
    expect(hasHeader('Documents')).toBe(true);
    expect(hasHeader('Field matches')).toBe(false);
    expect(hasHeader('Jump to')).toBe(false);
  });

  it('shows all result groups with counts when no filter is active', () => {
    window.history.replaceState({}, '', '/cms/?modal=search&q=pages');
    renderSearch();
    // "Pages" matches the collection, the doc slug hit, and the field hit.
    expect(getChip('All').getAttribute('aria-pressed')).toBe('true');
    expect(chipCount('All')).toBe('3');
    expect(chipCount('Documents')).toBe('1');
    expect(chipCount('Field matches')).toBe('1');
    expect(chipCount('Collections')).toBe('1');
    expect(chipCount('Releases')).toBeNull();
    expect(hasHeader('Jump to')).toBe(true);
    expect(hasHeader('Documents')).toBe(true);
    expect(hasHeader('Field matches')).toBe(true);
  });

  it('filters results and mirrors the filter into the URL', async () => {
    window.history.replaceState({}, '', '/cms/?modal=search&q=pages');
    renderSearch();
    fireEvent.click(getChip('Collections'));
    expect(hasHeader('Jump to')).toBe(true);
    expect(hasHeader('Documents')).toBe(false);
    await flush();
    expect(window.location.search).toBe(
      '?modal=search&q=pages&type=collections'
    );
  });

  it('offers to reset the filter when it hides every result', () => {
    window.history.replaceState(
      {},
      '',
      '/cms/?modal=search&q=pages&type=releases'
    );
    renderSearch();
    expect(screen.getByText('No releases match.')).toBeTruthy();
    fireEvent.click(screen.getByText('Show all results'));
    expect(hasHeader('Documents')).toBe(true);
    expect(getChip('All').getAttribute('aria-pressed')).toBe('true');
  });

  it('removes the search params from the URL on close', async () => {
    window.history.replaceState(
      {},
      '',
      '/cms/?deeplink=fields.title&modal=search&q=pages'
    );
    renderSearch();
    fireEvent.keyDown(getInput(), {code: 'Escape', key: 'Escape'});
    expect(window.location.search).toBe('?deeplink=fields.title');
    await flush();
    expect(window.location.search).toBe('?deeplink=fields.title');
    expect(
      screen.queryByPlaceholderText('Search docs, collections, releases…')
    ).toBeNull();
  });

  it('opens via openGlobalSearch() and syncs the query into the URL', async () => {
    window.history.replaceState({}, '', '/cms/content/Pages');
    renderSearch();
    act(() => {
      openGlobalSearch({query: 'hello'});
    });
    expect(getInput().value).toBe('hello');
    fireEvent.input(getInput(), {target: {value: 'hello world'}});
    await flush();
    expect(window.location.pathname).toBe('/cms/content/Pages');
    expect(window.location.search).toBe('?modal=search&q=hello+world');
  });

  it('hides the filter chips while the query is empty', () => {
    window.history.replaceState({}, '', '/cms/?modal=search');
    renderSearch();
    expect(getInput().value).toBe('');
    expect(screen.queryByRole('group', {name: 'Filter results'})).toBeNull();
  });
});
