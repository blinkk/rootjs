import {IconChevronDown, IconSelector, IconX} from '@tabler/icons-preact';
import type {ComponentChildren} from 'preact';
import type {SceneMeta} from '../types.js';
import {Avatar, CmsFrame} from '../ui/cms.js';

export const meta: SceneMeta = {
  id: 'cms-roles',
  width: 960,
  height: 600,
  alt: 'The sharing settings in the Root.js CMS, granting people and a whole email domain Admin, Editor or Viewer roles, with a group whose role is limited to specific collections.',
};

/**
 * `CmsFrame` has no active state for the Settings button at the bottom of the
 * sidebar, so the scene draws the active marker itself.
 */
const SETTINGS_ACTIVE_CSS = `
.cms-side > .cms-side__item:last-child::after {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--cms-accent);
}
`;

const ROLE_HELP: Array<[string, string]> = [
  ['VIEWER', 'view docs but not edit'],
  ['CONTRIBUTOR', 'view and edit docs, but not publish'],
  ['EDITOR', 'view, edit, and publish docs'],
  ['ADMIN', 'all of the above and change sharing settings'],
];

/** Direct role grants, sorted by email like the real share box. */
const USER_ROLES: Array<{email: string; name: string; role: string}> = [
  {email: '*@fernwood.example', name: 'Fernwood', role: 'VIEWER'},
  {email: 'ada@fernwood.example', name: 'Ada', role: 'ADMIN'},
  {email: 'kenji@fernwood.example', name: 'Kenji', role: 'EDITOR'},
  {email: 'priya@fernwood.example', name: 'Priya', role: 'EDITOR'},
];

const BORDER = '1px solid var(--cms-border)';

/** A Mantine-style select (square corners, as in the real share box). */
function Select(props: {value: string; disabled?: boolean}) {
  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        height: '28px',
        padding: '0 8px 0 10px',
        border: '1px solid #ced4da',
        background: props.disabled ? '#f1f3f5' : '#fff',
        color: props.disabled ? '#868e96' : 'var(--cms-text)',
        fontSize: '11.5px',
      }}
    >
      {props.value}
      <IconSelector
        size={13}
        color="#adb5bd"
        style={{marginLeft: 'auto', flex: '0 0 auto'}}
      />
    </span>
  );
}

function Label(props: {children: ComponentChildren}) {
  return (
    <div style={{fontSize: '11.5px', fontWeight: 600, marginBottom: '4px'}}>
      {props.children}
    </div>
  );
}

function SectionTitle(props: {children: ComponentChildren}) {
  return (
    <div style={{fontSize: '15px', fontWeight: 700, marginBottom: '6px'}}>
      {props.children}
    </div>
  );
}

/** A collection value in the group's collections multiselect. */
function CollectionChip(props: {children: string}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        height: '20px',
        padding: '0 4px 0 8px',
        background: '#f1f3f5',
        borderRadius: '2px',
        fontSize: '11px',
        fontWeight: 500,
      }}
    >
      {props.children}
      <IconX size={11} color="#868e96" />
    </span>
  );
}

/** An accordion row header for a permission group. */
function GroupTrigger(props: {name: string; users: number; open?: boolean}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        height: '34px',
        padding: '0 14px',
        fontSize: '12.5px',
      }}
    >
      <IconChevronDown
        size={15}
        color="#495057"
        style={{transform: props.open ? 'none' : 'rotate(-90deg)'}}
      />
      <span style={{fontWeight: 600}}>{props.name}</span>
      <span
        style={{
          marginLeft: 'auto',
          padding: '1px 6px',
          borderRadius: '3px',
          background: '#f1f3f5',
          color: '#495057',
          fontSize: '9.5px',
          fontWeight: 700,
          letterSpacing: '0.3px',
          textTransform: 'uppercase',
        }}
      >
        {props.users} users
      </span>
    </div>
  );
}

/** The "Share" section of the Settings page: users, domains and groups. */
export default function Roles() {
  return (
    <CmsFrame>
      <style>{SETTINGS_ACTIVE_CSS}</style>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '258px 1fr',
          gap: '32px',
          alignItems: 'start',
          padding: '20px 28px',
          fontSize: '12.5px',
        }}
      >
        <div>
          <div style={{fontSize: '20px', fontWeight: 700, marginTop: '2px'}}>
            Share
          </div>
          <div
            className="cms-muted"
            style={{fontWeight: 500, lineHeight: 1.55, marginTop: '10px'}}
          >
            <p style={{margin: 0}}>
              Share access to the CMS. To share with everyone in a domain, use{' '}
              <span className="cms-mono" style={{fontSize: '11.5px'}}>
                *@fernwood.example
              </span>
              .
            </p>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                margin: '16px 0',
              }}
            >
              {ROLE_HELP.map(([role, help]) => (
                <div>
                  <span
                    className="cms-mono"
                    style={{
                      display: 'inline-block',
                      padding: '1px 6px',
                      marginBottom: '3px',
                      borderRadius: '3px',
                      background: 'var(--cms-chip)',
                      color: 'var(--cms-text)',
                      fontSize: '10.5px',
                      fontWeight: 500,
                    }}
                  >
                    {role}
                  </span>
                  <div>{help}</div>
                </div>
              ))}
            </div>
            <p style={{margin: 0}}>
              Use <strong style={{color: 'var(--cms-text)'}}>groups</strong> to
              manage many users at once and optionally scope a role to specific
              collections.
            </p>
          </div>
        </div>
        <div className="cms-panel" style={{padding: '14px 18px 16px'}}>
          <SectionTitle>Users</SectionTitle>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 120px',
              gap: '8px',
            }}
          >
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                height: '28px',
                padding: '0 10px',
                border: '1px solid #ced4da',
                color: '#adb5bd',
                fontSize: '11.5px',
              }}
            >
              name@fernwood.example
            </span>
            <span
              className="cms-button cms-button--dark"
              style={{justifyContent: 'center', borderRadius: 0}}
            >
              Add user
            </span>
          </div>
          <div style={{marginTop: '8px', padding: '4px 0', border: BORDER}}>
            {USER_ROLES.map((user) => (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '24px minmax(0, 1fr) 120px',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '4px 14px',
                }}
              >
                <Avatar name={user.name} />
                <span
                  className="cms-muted"
                  style={{fontWeight: 600, fontSize: '12px'}}
                >
                  {user.email}
                  {user.name === 'Ada' && ' (you)'}
                </span>
                <Select value={user.role} disabled={user.name === 'Ada'} />
              </div>
            ))}
          </div>

          <div style={{marginTop: '14px'}}>
            <SectionTitle>Groups</SectionTitle>
          </div>
          <div style={{border: BORDER, background: '#fff'}}>
            <GroupTrigger name="Growing guides team" users={2} open />
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                padding: '2px 16px 12px',
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '130px 1fr',
                  gap: '12px',
                }}
              >
                <div>
                  <Label>Role</Label>
                  <Select value="EDITOR" />
                </div>
                <div>
                  <Label>Collections</Label>
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      height: '28px',
                      padding: '0 8px 0 4px',
                      border: '1px solid #ced4da',
                    }}
                  >
                    <CollectionChip>GrowingGuides</CollectionChip>
                    <CollectionChip>Recipes</CollectionChip>
                    <IconX
                      size={13}
                      color="#adb5bd"
                      style={{marginLeft: 'auto'}}
                    />
                  </span>
                </div>
              </div>
              <div>
                <Label>Users</Label>
                <div style={{border: BORDER}}>
                  {['Lea', 'Sam'].map((name, i) => (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '24px minmax(0, 1fr) auto',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '3px 12px',
                        borderTop: i === 0 ? 'none' : BORDER,
                        fontSize: '12px',
                      }}
                    >
                      <Avatar name={name} />
                      <span>{`${name.toLowerCase()}@fernwood.example`}</span>
                      <IconX size={13} color="#868e96" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={{borderTop: BORDER}}>
              <GroupTrigger name="Market photographers" users={3} />
            </div>
          </div>
        </div>
      </div>
    </CmsFrame>
  );
}
