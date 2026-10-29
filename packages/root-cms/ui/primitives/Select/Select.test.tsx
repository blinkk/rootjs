import {cleanup, fireEvent, render, screen} from '@testing-library/preact';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {MultiSelect} from '../MultiSelect/MultiSelect.js';
import {getComboboxItems, resolveOptions} from './combobox.js';
import {Select} from './Select.js';

const DATA = [
  {value: 'admin', label: 'Admin'},
  {value: 'editor', label: 'Editor', disabled: true},
  {value: 'contributor', label: 'Contributor'},
  {value: 'viewer', label: 'Viewer'},
];

function key(key: string) {
  fireEvent.keyDown(document.activeElement!, {key});
}

function activeOption() {
  const id = document.activeElement!.getAttribute('aria-activedescendant');
  return id ? document.getElementById(id)?.textContent : null;
}

describe('getComboboxItems', () => {
  it('filters, groups ungrouped options first, and adds a create entry', () => {
    const options = resolveOptions([
      {value: 'fr', label: 'French', group: 'Europe'},
      'en',
      {value: 'ja', label: 'Japanese', group: 'Asia'},
      {value: 'de', label: 'German', group: 'Europe'},
    ]);
    const all = getComboboxItems({options, query: null});
    expect(
      all.map((item) => item.kind === 'option' && item.option.value)
    ).toEqual(['en', 'fr', 'de', 'ja']);

    const items = getComboboxItems({options, query: 'an', creatable: true});
    // Groups keep their order while filtering.
    expect(
      items.map((item) => item.kind === 'option' && item.option.value)
    ).toEqual(['de', 'ja', false]);
    expect(items[2]).toEqual({kind: 'create', query: 'an'});

    // No create entry when the query matches an option exactly.
    const exact = getComboboxItems({options, query: 'german', creatable: true});
    expect(exact.map((item) => item.kind)).toEqual(['option']);
  });
});

describe('Select', () => {
  afterEach(() => cleanup());

  it('opens from the keyboard, skips disabled options, and selects with Enter', () => {
    const onValueChange = vi.fn();
    render(
      <Select
        aria-label="Role"
        data={DATA}
        defaultValue="admin"
        onValueChange={onValueChange}
      />
    );
    const trigger = screen.getByRole('combobox', {name: 'Role'});
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    trigger.focus();
    key('ArrowDown');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.getAttribute('aria-controls')).toBe(
      screen.getByRole('listbox').id
    );
    // Opens on the selected option, and focus stays on the trigger.
    expect(activeOption()).toBe('Admin');
    expect(document.activeElement).toBe(trigger);

    // "Editor" is disabled, so it's skipped.
    key('ArrowDown');
    expect(activeOption()).toBe('Contributor');
    key('End');
    expect(activeOption()).toBe('Viewer');
    key('Home');
    expect(activeOption()).toBe('Admin');

    key('ArrowUp');
    key('Enter');
    expect(onValueChange).toHaveBeenLastCalledWith('viewer');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(trigger.textContent).toBe('Viewer');
  });

  it('jumps to options by typeahead when not searchable', () => {
    render(<Select aria-label="Role" data={DATA} />);
    const trigger = screen.getByRole('combobox');
    trigger.focus();
    key('v');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(activeOption()).toBe('Viewer');
    key('Escape');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('filters as you type, creates new values, and clears', () => {
    const onValueChange = vi.fn();
    const onCreate = vi.fn((query: string) => ({value: query}));
    render(
      <Select
        aria-label="Tag"
        data={['apple', 'banana', 'apricot']}
        searchable
        clearable
        creatable
        onCreate={onCreate}
        onValueChange={onValueChange}
        nothingFound="Nothing found"
      />
    );
    const input = screen.getByRole('combobox') as HTMLInputElement;
    input.focus();
    fireEvent.input(input, {target: {value: 'ap'}});
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'apple',
      'apricot',
      '+ Create "ap"',
    ]);
    // The first match is highlighted.
    expect(activeOption()).toBe('apple');
    key('ArrowDown');
    key('Enter');
    expect(onValueChange).toHaveBeenLastCalledWith('apricot');
    expect(input.value).toBe('apricot');

    fireEvent.input(input, {target: {value: 'cherry'}});
    expect(activeOption()).toBe('+ Create "cherry"');
    key('Enter');
    expect(onCreate).toHaveBeenCalledWith('cherry');
    expect(onValueChange).toHaveBeenLastCalledWith('cherry');

    fireEvent.click(screen.getByRole('button', {name: 'Clear'}));
    expect(onValueChange).toHaveBeenLastCalledWith(null);
    expect(input.value).toBe('');
  });

  it('shows the nothing found state', () => {
    render(
      <Select
        aria-label="Fruit"
        data={['apple']}
        searchable
        nothingFound="No fruit"
      />
    );
    const input = screen.getByRole('combobox');
    input.focus();
    fireEvent.input(input, {target: {value: 'zzz'}});
    expect(screen.getByText('No fruit')).toBeTruthy();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });
});

describe('MultiSelect', () => {
  afterEach(() => cleanup());

  it('adds options as chips, hides them from the list, and removes with Backspace', () => {
    const onValueChange = vi.fn();
    render(
      <MultiSelect
        aria-label="Roles"
        data={DATA}
        defaultValue={['viewer']}
        onValueChange={onValueChange}
      />
    );
    const input = screen.getByRole('combobox') as HTMLInputElement;
    expect(screen.getByRole('button', {name: 'Remove Viewer'})).toBeTruthy();

    input.focus();
    key('ArrowDown');
    const listbox = screen.getByRole('listbox');
    expect(listbox.getAttribute('aria-multiselectable')).toBe('true');
    // The selected "Viewer" isn't listed.
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Admin',
      'Editor',
      'Contributor',
    ]);
    key('Enter');
    expect(onValueChange).toHaveBeenLastCalledWith(['viewer', 'admin']);
    // Stays open for more choices.
    expect(screen.getByRole('listbox')).toBeTruthy();

    key('Backspace');
    expect(onValueChange).toHaveBeenLastCalledWith(['viewer']);
    fireEvent.click(screen.getByRole('button', {name: 'Remove Viewer'}));
    expect(onValueChange).toHaveBeenLastCalledWith([]);
  });

  it('creates values from the search text and clears the search', () => {
    const onValueChange = vi.fn();
    render(
      <MultiSelect
        aria-label="Tags"
        data={['news']}
        creatable
        getCreateLabel={(query) => `+ Add tag ${query}`}
        onValueChange={onValueChange}
      />
    );
    const input = screen.getByRole('combobox') as HTMLInputElement;
    input.focus();
    fireEvent.input(input, {target: {value: 'launch'}});
    expect(activeOption()).toBe('+ Add tag launch');
    key('Enter');
    expect(onValueChange).toHaveBeenLastCalledWith(['launch']);
    expect(input.value).toBe('');
    // A value not in `data` still gets a chip.
    expect(screen.getByRole('button', {name: 'Remove launch'})).toBeTruthy();
  });
});
