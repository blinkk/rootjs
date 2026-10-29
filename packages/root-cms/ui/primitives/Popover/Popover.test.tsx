import {cleanup, fireEvent, render, screen} from '@testing-library/preact';
import {useState} from 'preact/hooks';
import {afterEach, describe, expect, it} from 'vitest';
import {Menu, MenuItem} from '../Menu/Menu.js';
import {Popover} from './Popover.js';

describe('Popover', () => {
  afterEach(() => cleanup());

  it('toggles on click, moves focus in, and returns it on Escape', () => {
    render(
      <Popover label="Assign" trigger={<button type="button">Assign</button>}>
        <button type="button">Alex</button>
        <button type="button">Sam</button>
      </Popover>
    );
    const trigger = screen.getByRole('button', {name: 'Assign'});
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', {name: 'Assign'});
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement?.textContent).toBe('Alex');

    // Tab wraps inside the popover.
    screen.getByRole('button', {name: 'Sam'}).focus();
    fireEvent.keyDown(document.activeElement!, {key: 'Tab'});
    expect(document.activeElement?.textContent).toBe('Alex');

    fireEvent.keyDown(dialog, {key: 'Escape'});
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(trigger);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is controllable, and closes on an outside press', () => {
    function Controlled() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <span data-testid="state">{String(open)}</span>
          <Popover
            open={open}
            onOpenChange={setOpen}
            trigger={<button type="button">Open</button>}
          >
            Content
          </Popover>
        </>
      );
    }
    render(<Controlled />);
    expect(screen.getByRole('dialog').textContent).toBe('Content');
    fireEvent.pointerDown(screen.getByTestId('state'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('state').textContent).toBe('false');
  });

  it('keeps its parent open when a nested menu is used or dismissed', () => {
    render(
      <Popover
        label="Settings"
        trigger={<button type="button">Settings</button>}
      >
        <Menu trigger={<button type="button">Sort</button>}>
          <MenuItem>Newest</MenuItem>
        </Menu>
      </Popover>
    );
    fireEvent.click(screen.getByRole('button', {name: 'Settings'}));
    const sort = screen.getByRole('button', {name: 'Sort'});
    fireEvent.click(sort);
    const item = screen.getByRole('menuitem', {name: 'Newest'});

    // A press inside the menu (portaled outside the popover) keeps both open.
    fireEvent.pointerDown(item);
    expect(screen.getByRole('menu')).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy();

    // Escape closes only the topmost overlay.
    fireEvent.keyDown(item, {key: 'Escape'});
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(document.activeElement).toBe(sort);
  });
});
