import {IconCheck, IconDots, IconMessageCircle} from '@tabler/icons-preact';
import type {SceneMeta} from '../types.js';
import {
  Avatar,
  CmsFrame,
  DocStatusBar,
  EditorHeader,
  Field,
  Input,
  RichTextInput,
} from '../ui/cms.js';

export const meta: SceneMeta = {
  id: 'cms-field-comments',
  width: 960,
  height: 600,
  alt: 'A comment thread pinned to a field in the Root CMS editor, with teammates discussing a headline and an @mention.',
};

const COMMENTS = [
  {
    name: 'Priya',
    time: '10:42 AM',
    body: (
      <>
        Can we make this punchier? Also, “pulled this morning” is only true for
        the Saturday market, so let’s soften it.
      </>
    ),
  },
  {
    name: 'Kenji',
    time: '10:51 AM',
    body: (
      <>
        Tightened it up. <strong style={{color: '#1c7ed6'}}>@Lea</strong> can
        you check the German version once this lands?
      </>
    ),
  },
  {
    name: 'Lea',
    time: '11:05 AM',
    body: <>On it — I’ll update it in the translations sheet.</>,
  },
];

/** A field comment thread next to the doc editor. */
export default function FieldComments() {
  return (
    <CmsFrame
      active="content"
      topRight={
        <DocStatusBar
          viewers={['Priya', 'Kenji', 'Lea']}
          saveState="Kenji edited 1 min ago"
          badges={[['draft', 'Draft']]}
          activeTool="comments"
          comments={4}
        />
      }
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 340px',
          height: '100%',
        }}
      >
        <div className="cms-editor">
          <EditorHeader docId="Pages/spring-harvest" />
          <div className="cms-editor__fields">
            <Field label="Eyebrow">
              <Input>Spring harvest</Input>
            </Field>
            <Field label="Title" comments={3}>
              <Input focused textarea>
                Dig into the spring harvest
              </Input>
            </Field>
            <Field label="Body" comments={1}>
              <RichTextInput>
                Heirloom carrots, candy-striped beets and peppery radishes,
                pulled this morning by growers just down the road.
              </RichTextInput>
            </Field>
            <Field label="Button label">
              <Input>Shop the market</Input>
            </Field>
          </div>
        </div>
        <aside
          style={{
            background: '#fff',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            fontSize: '12.5px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 700,
              fontSize: '13px',
            }}
          >
            <IconMessageCircle size={17} />
            Comments
            <span className="cms-chip" style={{marginLeft: 'auto'}}>
              4 open
            </span>
          </div>
          <div
            className="cms-panel"
            style={{
              padding: '12px',
              borderColor: '#a5d8ff',
              boxShadow: '0 4px 16px rgba(28, 126, 214, 0.08)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '10px',
              }}
            >
              <span className="cms-mono cms-muted" style={{fontSize: '11px'}}>
                content.modules[0].title
              </span>
              <span className="cms-icon-button" style={{marginLeft: 'auto'}}>
                <IconCheck />
              </span>
              <span className="cms-icon-button">
                <IconDots />
              </span>
            </div>
            <div
              style={{display: 'flex', flexDirection: 'column', gap: '12px'}}
            >
              {COMMENTS.map((c) => (
                <div style={{display: 'flex', gap: '8px'}}>
                  <Avatar name={c.name} />
                  <div>
                    <div>
                      <strong>{c.name}</strong>{' '}
                      <span className="cms-muted" style={{fontSize: '11px'}}>
                        {c.time}
                      </span>
                    </div>
                    <div style={{lineHeight: 1.5, marginTop: '2px'}}>
                      {c.body}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div
              style={{
                marginTop: '12px',
                padding: '8px 10px',
                border: '1px solid var(--cms-border)',
                borderRadius: '6px',
                color: '#868e96',
              }}
            >
              Reply or @mention a teammate…
            </div>
          </div>
          <div className="cms-panel" style={{padding: '12px', opacity: 0.8}}>
            <div className="cms-mono cms-muted" style={{fontSize: '11px'}}>
              content.modules[0].body
            </div>
            <div style={{display: 'flex', gap: '8px', marginTop: '8px'}}>
              <Avatar name="Sam" />
              <div style={{lineHeight: 1.5}}>
                <strong>Sam</strong> Swap “peppery” for “crisp”? Sounds fresher.
              </div>
            </div>
          </div>
        </aside>
      </div>
    </CmsFrame>
  );
}
