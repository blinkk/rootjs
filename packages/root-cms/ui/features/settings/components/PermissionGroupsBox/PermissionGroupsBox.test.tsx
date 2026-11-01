import {cleanup, fireEvent, render, screen} from '@testing-library/preact';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {newPermissionGroup} from '../../permissionGroups.js';
import {PermissionGroupsBox} from './PermissionGroupsBox.js';

const profiles = new Map([
  [
    'ada@example.com',
    {
      email: 'ada@example.com',
      displayName: 'Ada Lovelace',
      lastSignedInAt: {seconds: Math.floor(Date.now() / 1000) - 2 * 86400},
    },
  ],
]);

vi.mock('../../../users/useUserProfile.js', () => ({
  useUserProfiles: () => ({profiles}),
}));

function renderGroup(disabled = false) {
  const group = newPermissionGroup({
    id: 'blog',
    name: 'Blog editors',
    role: 'EDITOR',
    users: ['ada@example.com', 'me@example.com'],
  });
  const onChange = vi.fn();
  render(
    <PermissionGroupsBox
      groups={[group]}
      onChange={onChange}
      collections={[]}
      disabled={disabled}
    />
  );
  fireEvent.click(screen.getByRole('button', {name: /Blog editors/}));
  return {group, onChange};
}

describe('PermissionGroupsBox', () => {
  beforeEach(() => {
    window.firebase = {user: {email: 'me@example.com'}} as any;
  });

  afterEach(() => cleanup());

  it('shows each member the same way as the users list', () => {
    renderGroup();
    expect(screen.getByText('Ada Lovelace')).toBeTruthy();
    expect(screen.getByText('ada@example.com')).toBeTruthy();
    expect(screen.getByText('2 days ago')).toBeTruthy();
    expect(screen.getByText('me@example.com')).toBeTruthy();
    expect(screen.getByText('You')).toBeTruthy();
  });

  it('changes the group role from the role menu', () => {
    const {group, onChange} = renderGroup();
    fireEvent.click(screen.getByRole('button', {name: 'Role: EDITOR'}));
    expect(screen.getByText('View docs but not edit')).toBeTruthy();
    expect(screen.queryByRole('menuitem', {name: 'Remove access'})).toBeNull();
    fireEvent.click(screen.getByRole('menuitem', {name: /^VIEWER/}));
    expect(onChange).toHaveBeenCalledWith([{...group, role: 'VIEWER'}]);
  });

  it('labels the role menu and disables it with the form', () => {
    renderGroup(true);
    const trigger = screen.getByRole('button', {
      name: 'Role: EDITOR',
    }) as HTMLButtonElement;
    expect(trigger.disabled).toBe(true);
    expect(screen.getByText('Role').getAttribute('for')).toBe(trigger.id);
  });
});
