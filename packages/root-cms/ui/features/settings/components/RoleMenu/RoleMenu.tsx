import {IconCheck, IconChevronDown} from '@tabler/icons-preact';
import {ComponentChildren} from 'preact';
import {UserRole} from '../../../../../core/client.js';
import {Button} from '../../../../primitives/Button/Button.js';
import {Field, useFieldId} from '../../../../primitives/Field/Field.js';
import {Menu, MenuDivider, MenuItem} from '../../../../primitives/Menu/Menu.js';
import {cn} from '../../../../utils/classes.js';

/** The roles offered in the menu, highest access first. */
const ROLE_OPTIONS: {role: UserRole; description: string}[] = [
  {role: 'ADMIN', description: 'All of the below and change sharing settings'},
  {role: 'EDITOR', description: 'View, edit, and publish docs'},
  {role: 'CONTRIBUTOR', description: 'View and edit docs, but not publish'},
  {role: 'VIEWER', description: 'View docs but not edit'},
];

export interface RoleMenuProps {
  className?: string;
  role: UserRole;
  /** The visible label above the control. */
  label?: ComponentChildren;
  /** The control's accessible name, e.g. "Role for grogu@example.com". */
  'aria-label'?: string;
  disabled?: boolean;
  onChange: (role: UserRole) => void;
  /** Adds a "Remove access" action to the end of the menu. */
  onRemove?: () => void;
}

/** A control for choosing a role, with help text describing each one. */
export function RoleMenu(props: RoleMenuProps) {
  const {role, label, disabled, onChange, onRemove} = props;
  const id = useFieldId();
  const className = cn('RoleMenu', props.className);
  const menu = (
    <Menu
      placement="bottom-end"
      width={280}
      trigger={
        <Button
          id={id}
          className="RoleMenu__trigger w-full justify-between font-normal"
          aria-label={props['aria-label']}
          iconRight={<IconChevronDown />}
          disabled={disabled}
        >
          {role}
        </Button>
      }
    >
      {ROLE_OPTIONS.map((option) => (
        <MenuItem
          key={option.role}
          hint={option.role === role ? <IconCheck /> : undefined}
          onClick={() => onChange(option.role)}
        >
          <span className="RoleMenu__role block font-semibold">
            {option.role}
          </span>
          <span className="RoleMenu__description mt-0.5 block text-muted">
            {option.description}
          </span>
        </MenuItem>
      ))}
      {onRemove && <MenuDivider />}
      {onRemove && (
        <MenuItem danger onClick={onRemove}>
          Remove access
        </MenuItem>
      )}
    </Menu>
  );
  if (label) {
    return (
      <Field id={id} label={label} className={className}>
        {menu}
      </Field>
    );
  }
  return <div className={className}>{menu}</div>;
}
