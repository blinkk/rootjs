import {cleanup, fireEvent, render, screen} from '@testing-library/preact';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {UserRole} from '../../../../../core/client.js';
import {ShareBox} from './ShareBox.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const profiles = new Map([
  [
    'ada@example.com',
    {
      email: 'ada@example.com',
      displayName: 'Ada Lovelace',
      lastSignedInAt: {seconds: Math.floor((Date.now() - 2 * DAY_MS) / 1000)},
    },
  ],
  [
    'noname@example.com',
    {
      email: 'noname@example.com',
      lastSignedInAt: {seconds: Math.floor((Date.now() - 2 * DAY_MS) / 1000)},
    },
  ],
  ['newbie@example.com', {email: 'newbie@example.com', displayName: 'Newbie'}],
]);

vi.mock('../../../users/useUserProfile.js', () => ({
  useUserProfiles: () => ({profiles}),
}));

function renderBox(
  roles: Record<string, UserRole>,
  currentUserIsAdmin = true,
  onChange = vi.fn()
) {
  render(
    <ShareBox
      roles={roles}
      onChange={onChange}
      currentUserIsAdmin={currentUserIsAdmin}
    />
  );
  return onChange;
}

function openRoleMenu(email: string) {
  const trigger = screen.getByRole('button', {
    name: new RegExp(`^Role for ${email}`),
  });
  fireEvent.click(trigger);
  return trigger;
}

describe('ShareBox', () => {
  beforeEach(() => {
    window.firebase = {user: {email: 'me@example.com'}} as any;
  });

  afterEach(() => cleanup());

  it('shows the display name, email and last login', () => {
    renderBox({'ada@example.com': 'EDITOR'});
    expect(screen.getByText('Ada Lovelace')).toBeTruthy();
    expect(screen.getByText('ada@example.com')).toBeTruthy();
    expect(screen.getByText('2 days ago')).toBeTruthy();
    expect(screen.getByText(/Last login/)).toBeTruthy();
  });

  it('falls back to the email when there is no display name', () => {
    renderBox({'noname@example.com': 'EDITOR'});
    expect(screen.getByText('noname@example.com')).toBeTruthy();
    expect(screen.getByText(/Last login/)).toBeTruthy();
  });

  it('leaves out the last login when it is not available', () => {
    renderBox({
      'newbie@example.com': 'EDITOR',
      'unknown@example.com': 'VIEWER',
    });
    expect(screen.getByText('Newbie')).toBeTruthy();
    expect(screen.getByText('unknown@example.com')).toBeTruthy();
    expect(screen.queryByText(/Last login/)).toBeNull();
    expect(screen.queryByText(/never/i)).toBeNull();
  });

  it('only badges the current user', () => {
    renderBox({'ada@example.com': 'EDITOR'});
    expect(screen.queryByText('You')).toBeNull();
    cleanup();

    renderBox({'me@example.com': 'ADMIN'});
    expect(screen.getByText('me@example.com')).toBeTruthy();
    expect(screen.getByText('You')).toBeTruthy();
  });

  it('describes each role in the menu and marks the current one', () => {
    renderBox({'ada@example.com': 'EDITOR'});
    openRoleMenu('ada@example.com');
    expect(screen.getByText('View, edit, and publish docs')).toBeTruthy();
    expect(screen.getByText('View docs but not edit')).toBeTruthy();
    const items = screen.getAllByRole('menuitem');
    expect(items.map((item) => item.querySelector('svg') !== null)).toEqual([
      false,
      true,
      false,
      false,
      false,
    ]);
  });

  it('changes the role from the menu', () => {
    const onChange = renderBox({'ada@example.com': 'EDITOR'});
    openRoleMenu('ada@example.com');
    fireEvent.click(screen.getByRole('menuitem', {name: /^VIEWER/}));
    expect(onChange).toHaveBeenCalledWith({'ada@example.com': 'VIEWER'});
  });

  it('removes access from the menu', () => {
    const onChange = renderBox({
      'ada@example.com': 'EDITOR',
      'noname@example.com': 'VIEWER',
    });
    openRoleMenu('ada@example.com');
    fireEvent.click(screen.getByRole('menuitem', {name: 'Remove access'}));
    expect(onChange).toHaveBeenCalledWith({'noname@example.com': 'VIEWER'});
  });

  it('disables the role menu for yourself and for non-admins', () => {
    renderBox({'me@example.com': 'ADMIN'});
    const self = screen.getByRole('button', {
      name: /^Role for me@example.com/,
    }) as HTMLButtonElement;
    expect(self.disabled).toBe(true);
    cleanup();

    renderBox({'ada@example.com': 'EDITOR'}, false);
    const other = screen.getByRole('button', {
      name: /^Role for ada@example.com/,
    }) as HTMLButtonElement;
    expect(other.disabled).toBe(true);
  });
});
