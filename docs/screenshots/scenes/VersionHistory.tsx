import {
  IconArrowUpRight,
  IconCheck,
  IconCopy,
  IconDeviceDesktop,
  IconMessage,
  IconRefresh,
  IconRocket,
  IconX,
} from '@tabler/icons-preact';
import type {ComponentChildren} from 'preact';
import type {SceneMeta} from '../types.js';
import {
  Avatar,
  CmsFrame,
  DocStatusBar,
  EditorHeader,
  Field,
  Input,
  RichTextInput,
  USERS,
} from '../ui/cms.js';
import {SITE_COPY, SitePreview} from '../ui/site.js';

export const meta: SceneMeta = {
  id: 'cms-version-history',
  width: 960,
  height: 600,
  alt: 'The version history of a page in the Root.js CMS, listing autosaved and published versions with who made each one, a publish message, and actions to compare, restore, or copy a version.',
};

const VERSIONS: Array<{
  when: string;
  by: string;
  /** The current draft, shown first. */
  latest?: boolean;
  published?: boolean;
  /** The release the version was published with. */
  release?: boolean;
  /** Whether the version has a publish message. */
  message?: boolean;
  selected?: boolean;
}> = [
  {when: 'Mar 18, 2027, 09:12 AM', by: 'Kenji', latest: true, selected: true},
  {when: 'Mar 18, 2027, 08:40 AM', by: 'Kenji'},
  {when: 'Mar 17, 2027, 04:55 PM', by: 'Priya'},
  {
    when: 'Mar 10, 2027, 11:20 AM',
    by: 'Lea',
    published: true,
    message: true,
    selected: true,
  },
  {when: 'Mar 9, 2027, 03:02 PM', by: 'Sam'},
  {when: 'Mar 3, 2027, 07:00 AM', by: 'Ada', published: true, release: true},
  {when: 'Mar 1, 2027, 10:18 AM', by: 'Ada'},
];

const PUBLISH_MESSAGE =
  'Swap “peppery” for “crisp” and note we pick on market Saturdays. Updated de and fr strings.';

/** A Mantine-style checkbox. */
function Checkbox(props: {checked?: boolean}) {
  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '16px',
        height: '16px',
        borderRadius: '4px',
        border: `1px solid ${props.checked ? '#228be6' : '#ced4da'}`,
        background: props.checked ? '#228be6' : '#fff',
        color: '#fff',
      }}
    >
      {props.checked && <IconCheck size={12} stroke={3} />}
    </span>
  );
}

/** A small light icon button next to a version's timestamp. */
function VersionIcon(props: {children: ComponentChildren}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '22px',
        height: '22px',
        borderRadius: '4px',
        background: '#e7f5ff',
        color: '#1c7ed6',
      }}
    >
      {props.children}
    </span>
  );
}

/** The version history modal, open over the doc editor. */
export default function VersionHistory() {
  return (
    <CmsFrame
      active="content"
      topRight={
        <DocStatusBar
          viewers={['Kenji', 'Lea']}
          saveState="Saved just now"
          badges={[
            ['draft', 'Draft'],
            ['published', 'Published'],
          ]}
        />
      }
    >
      <div style={{position: 'relative', height: '100%'}}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '400px 1fr',
            height: '100%',
          }}
        >
          <div className="cms-editor">
            <EditorHeader docId="Pages/spring-harvest" />
            <div className="cms-editor__fields">
              <Field label="Eyebrow">
                <Input>{SITE_COPY.eyebrow}</Input>
              </Field>
              <Field label="Title">
                <Input textarea>{SITE_COPY.title}</Input>
              </Field>
              <Field label="Body">
                <RichTextInput>
                  Heirloom carrots, candy-striped beets and crisp radishes,
                  picked on market Saturdays by growers just down the road.
                </RichTextInput>
              </Field>
              <Field label="Button label">
                <Input>{SITE_COPY.primaryCta}</Input>
              </Field>
            </div>
          </div>
          <div className="cms-preview">
            <div className="cms-preview__bar">
              <span className="cms-icon-button cms-button--active">
                <IconDeviceDesktop />
              </span>
              <span className="cms-preview__url">
                fernwood.example/spring-harvest/?preview=true
              </span>
              <span className="cms-icon-button">
                <IconRefresh />
              </span>
            </div>
            <div className="cms-preview__frames">
              <SitePreview device="desktop" width={460} height={520} />
            </div>
          </div>
        </div>
        <div
          className="cms-modal-overlay"
          style={{alignItems: 'flex-start', paddingTop: '28px'}}
        >
          <div className="cms-modal" style={{width: '720px'}}>
            <div
              className="cms-modal__title"
              style={{justifyContent: 'space-between'}}
            >
              <span>Version history: Pages/spring-harvest</span>
              <span className="cms-icon-button">
                <IconX />
              </span>
            </div>
            <div style={{padding: '14px 20px 16px'}}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span className="cms-button cms-button--blue">
                  Compare
                  <IconArrowUpRight />
                </span>
                <span
                  style={{display: 'flex', alignItems: 'center', gap: '8px'}}
                >
                  <Checkbox />
                  Published versions only
                </span>
              </div>
              <table
                style={{
                  width: '100%',
                  marginTop: '14px',
                  borderCollapse: 'collapse',
                  fontSize: '12.5px',
                }}
              >
                <thead>
                  <tr
                    style={{
                      textAlign: 'left',
                      color: '#495057',
                      fontSize: '11.5px',
                      borderBottom: '1px solid #dee2e6',
                    }}
                  >
                    <th style={{width: '36px', padding: '8px 10px'}} />
                    <th style={{width: '270px', padding: '8px 10px'}}>
                      Modified at
                    </th>
                    <th style={{padding: '8px 10px'}}>Modified by</th>
                    <th style={{padding: '8px 10px'}}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {VERSIONS.map((v) => (
                    <tr
                      style={{
                        borderBottom: '1px solid #f1f3f5',
                        background: v.selected ? '#f8fbff' : undefined,
                      }}
                    >
                      <td style={{padding: '8px 10px'}}>
                        <Checkbox checked={v.selected} />
                      </td>
                      <td style={{padding: '8px 10px', position: 'relative'}}>
                        <span
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            minHeight: '24px',
                          }}
                        >
                          <span style={{flex: 1, whiteSpace: 'nowrap'}}>
                            {v.when}
                            {v.latest && ' (Latest)'}
                            {v.published && (
                              <span style={{marginLeft: '4px', opacity: 0.5}}>
                                (Published)
                              </span>
                            )}
                          </span>
                          {v.message && (
                            <VersionIcon>
                              <IconMessage size={15} />
                            </VersionIcon>
                          )}
                          {v.release && (
                            <VersionIcon>
                              <IconRocket size={15} />
                            </VersionIcon>
                          )}
                        </span>
                        {v.message && (
                          <div
                            style={{
                              position: 'absolute',
                              left: 'calc(100% - 4px)',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              width: '394px',
                              padding: '8px 28px 8px 12px',
                              borderRadius: '6px',
                              background: '#1a1b1e',
                              color: '#fff',
                              fontSize: '12px',
                              lineHeight: 1.5,
                              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
                              zIndex: 1,
                            }}
                          >
                            <span
                              style={{
                                position: 'absolute',
                                left: '-5px',
                                top: '50%',
                                width: '10px',
                                height: '10px',
                                background: '#1a1b1e',
                                transform: 'translateY(-50%) rotate(45deg)',
                              }}
                            />
                            <IconX
                              size={13}
                              color="#909296"
                              style={{
                                position: 'absolute',
                                top: '9px',
                                right: '9px',
                              }}
                            />
                            {PUBLISH_MESSAGE}
                          </div>
                        )}
                      </td>
                      <td style={{padding: '8px 10px'}}>
                        <span
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          <Avatar name={v.by} />
                          {USERS[v.by].email}
                        </span>
                      </td>
                      <td style={{padding: '8px 10px'}}>
                        {!v.latest && (
                          <span style={{display: 'flex', gap: '6px'}}>
                            <span
                              className="cms-button"
                              style={{height: '22px', padding: '0 8px'}}
                            >
                              Restore
                            </span>
                            <span
                              className="cms-button"
                              style={{height: '22px', padding: '0 8px'}}
                            >
                              <IconCopy style={{width: '12px'}} />
                              Copy to doc
                            </span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div
                style={{
                  textAlign: 'center',
                  marginTop: '12px',
                  color: '#228be6',
                  fontWeight: 600,
                  fontSize: '12px',
                }}
              >
                Load more versions
              </div>
            </div>
          </div>
        </div>
      </div>
    </CmsFrame>
  );
}
