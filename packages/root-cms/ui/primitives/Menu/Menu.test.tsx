import {cleanup, fireEvent, render, screen} from '@testing-library/preact';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {Menu, MenuDivider, MenuItem} from './Menu.js';

function renderMenu(onDelete = vi.fn()) {
  render(
    <Menu trigger={<button type="button">Actions</button>}>
      <MenuItem>Duplicate</MenuItem>
      <MenuItem disabled>Lock</MenuItem>
      <MenuItem href="#preview">Open preview</MenuItem>
      <MenuDivider />
      <MenuItem danger onClick={onDelete}>
        Delete
      </MenuItem>
      <MenuItem>Download</MenuItem>
    </Menu>
  );
  return screen.getByRole('button', {name: 'Actions'});
}

function key(key: string) {
  fireEvent.keyDown(document.activeElement!, {key});
}

describe('Menu', () => {
  afterEach(() => cleanup());

  it('opens from the keyboard and moves focus with arrow keys, Home and End', () => {
    const trigger = renderMenu();
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    trigger.focus();
    key('ArrowDown');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const menu = screen.getByRole('menu');
    expect(trigger.getAttribute('aria-controls')).toBe(menu.id);
    expect(document.activeElement?.textContent).toBe('Duplicate');

    // The disabled "Lock" item is skipped.
    key('ArrowDown');
    expect(document.activeElement?.textContent).toBe('Open preview');
    key('End');
    expect(document.activeElement?.textContent).toBe('Download');
    // Wraps around.
    key('ArrowDown');
    expect(document.activeElement?.textContent).toBe('Duplicate');
    key('ArrowUp');
    expect(document.activeElement?.textContent).toBe('Download');
    key('Home');
    expect(document.activeElement?.textContent).toBe('Duplicate');
  });

  it('opens on ArrowUp with the last item focused', () => {
    const trigger = renderMenu();
    trigger.focus();
    key('ArrowUp');
    expect(document.activeElement?.textContent).toBe('Download');
  });

  it('jumps to items by typeahead', () => {
    const trigger = renderMenu();
    fireEvent.click(trigger);
    key('d');
    // "d" cycles through the items starting with it.
    expect(document.activeElement?.textContent).toBe('Delete');
    key('d');
    expect(document.activeElement?.textContent).toBe('Download');
    key('d');
    expect(document.activeElement?.textContent).toBe('Duplicate');
  });

  it('runs an item, closes, and returns focus to the trigger', () => {
    const onDelete = vi.fn();
    const trigger = renderMenu(onDelete);
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitem', {name: 'Delete'}));
    expect(onDelete).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('ignores disabled items', () => {
    const trigger = renderMenu();
    fireEvent.click(trigger);
    const lock = screen.getByRole('menuitem', {name: 'Lock'});
    expect(lock.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(lock);
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('closes on Escape and on an outside press', () => {
    const trigger = renderMenu();
    fireEvent.click(trigger);
    key('Escape');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes on Tab and moves focus back to the trigger', () => {
    const trigger = renderMenu();
    fireEvent.click(trigger);
    key('Tab');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
