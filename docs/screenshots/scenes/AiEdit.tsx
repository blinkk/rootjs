import {
  IconArrowBackUp,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconFileDiff,
  IconGripVertical,
  IconJson,
  IconPaperclip,
  IconRobot,
  IconSend2,
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
} from '../ui/cms.js';
import {GardenScene} from '../ui/garden.js';
import {SITE_COPY} from '../ui/site.js';

export const meta: SceneMeta = {
  id: 'cms-ai-edit',
  width: 960,
  height: 600,
  alt: 'Editing a page module with Root AI in the CMS: an editor asks for a punchier headline and image alt text, and reviews the suggested changes as a diff before accepting them.',
};

const NEW_TITLE = 'Spring roots, straight from the soil';
const NEW_ALT =
  'Rows of carrots, beets and radishes in a sunny garden bed, next to a crate of freshly pulled roots.';

type DiffLine = [number, ' ' | '+' | '-', string];

/** Lines of the module's JSON diff, after the unchanged lines above. */
const DIFF: DiffLine[] = [
  [11, ' ', '    ]'],
  [12, ' ', '  },'],
  [13, ' ', `  "eyebrow": "${SITE_COPY.eyebrow}",`],
  [14, ' ', '  "image": {'],
  [15, '-', '    "alt": "",'],
  [16, '+', `    "alt": "${NEW_ALT}",`],
  [17, ' ', '    "height": 1200,'],
  [18, ' ', '    "src": "/uploads/spring-harvest-hero.jpg",'],
  [19, ' ', '    "width": 2400'],
  [20, ' ', '  },'],
  [21, ' ', '  "primaryCta": {'],
  [22, ' ', '    "href": "/market/",'],
  [23, ' ', `    "label": "${SITE_COPY.primaryCta}"`],
  [24, ' ', '  },'],
  [25, '-', `  "title": "${SITE_COPY.title}"`],
  [26, '+', `  "title": "${NEW_TITLE}"`],
  [27, ' ', '}'],
];

const DIFF_COLORS: Record<string, [string, string, string]> = {
  ' ': ['transparent', '#333', 'transparent'],
  '+': ['#d4edda', '#155724', '#28a745'],
  '-': ['#f8d7da', '#721c24', '#dc3545'],
};

/** The JSON diff of the module, as rendered by the CMS `JsDiff` component. */
function Diff() {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
        border: '1px solid #ced4da',
        borderRadius: '4px',
        background: '#f8f9fa',
        padding: '8px 10px',
        fontFamily: 'var(--cms-font-mono)',
        fontSize: '11px',
        lineHeight: '17px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '3px 8px',
          marginBottom: '2px',
          background: '#f0f4f8',
          borderTop: '1px solid #d0d7de',
          borderBottom: '1px solid #d0d7de',
          color: '#57606a',
          fontFamily: 'var(--cms-font)',
          fontSize: '11px',
        }}
      >
        <IconChevronDown size={13} />
        10 unchanged lines hidden
      </div>
      {DIFF.map(([num, sign, text]) => {
        const [bg, fg, border] = DIFF_COLORS[sign];
        return (
          <div
            style={{
              display: 'flex',
              background: bg,
              color: fg,
              borderLeft: `3px solid ${border}`,
              paddingRight: '6px',
            }}
          >
            <span
              style={{
                flex: '0 0 30px',
                paddingRight: '10px',
                textAlign: 'right',
                color: '#6c757d',
              }}
            >
              {num}
            </span>
            <span style={{paddingRight: '6px'}}>{sign}</span>
            <span style={{whiteSpace: 'pre-wrap', minWidth: 0}}>{text}</span>
          </div>
        );
      })}
    </div>
  );
}

/** A chat message in the AI edit modal. */
function Message(props: {
  avatar: ComponentChildren;
  name: string;
  children: ComponentChildren;
}) {
  return (
    <div style={{display: 'flex', gap: '8px', alignItems: 'flex-start'}}>
      {props.avatar}
      <div style={{flex: 1, minWidth: 0}}>
        <div
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: '#495057',
            marginBottom: '3px',
          }}
        >
          {props.name}
        </div>
        <div style={{fontSize: '12.5px', lineHeight: 1.55}}>
          {props.children}
        </div>
      </div>
    </div>
  );
}

/** The chat side of the modal: the transcript and the prompt composer. */
function Chat() {
  return (
    <div style={{display: 'flex', flexDirection: 'column', minHeight: 0}}>
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          padding: '6px 4px',
        }}
      >
        <Message
          name="You"
          avatar={
            <span style={{margin: '-2px'}}>
              <Avatar name="Priya" large />
            </span>
          }
        >
          Make the headline punchier, and write alt text for the hero image.
        </Message>
        <Message
          name="Root AI"
          avatar={
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flex: '0 0 24px',
                height: '24px',
                borderRadius: '50%',
                background: '#f1f3f5',
                color: '#495057',
              }}
            >
              <IconRobot size={16} />
            </span>
          }
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              marginBottom: '6px',
              color: '#868e96',
              fontSize: '12px',
            }}
          >
            <IconChevronRight size={13} />
            Thinking
          </div>
          <p style={{margin: '0 0 6px'}}>
            I shortened the headline so it leads with what’s fresh, and
            described the hero photo for screen readers:
          </p>
          <ul style={{margin: '0 0 6px', paddingLeft: '18px'}}>
            <li>
              <strong>Title:</strong> {NEW_TITLE}
            </li>
            <li style={{marginTop: '3px'}}>
              <strong>Alt text:</strong> {NEW_ALT}
            </li>
          </ul>
          <p style={{margin: 0}}>
            Review the diff, then accept the changes to update the module.
          </p>
        </Message>
      </div>
      <div style={{padding: '10px 4px 0'}}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            height: '42px',
            padding: '0 6px 0 12px',
            border: '1px solid #dee2e6',
            borderRadius: '21px',
            background: '#fff',
          }}
        >
          <IconPaperclip size={16} color="#868e96" />
          <span style={{flex: 1, color: '#adb5bd', fontSize: '12.5px'}}>
            Tell me what you want to change...
          </span>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              background: '#222',
              color: '#fff',
              opacity: 0.35,
            }}
          >
            <IconSend2 size={15} />
          </span>
        </div>
        <div
          style={{
            marginTop: '8px',
            textAlign: 'center',
            fontSize: '11px',
            color: 'dimgray',
          }}
        >
          Root AI is experimental and makes mistakes. Check all info.
        </div>
      </div>
    </div>
  );
}

/** The JSON / Diff tabs on the right side of the modal. */
function Changes() {
  const tab = (icon: ComponentChildren, label: string, active: boolean) => (
    <span
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        height: '34px',
        marginBottom: '-2px',
        borderBottom: `2px solid ${active ? 'lightblue' : 'transparent'}`,
        color: active ? 'var(--cms-text)' : '#868e96',
        fontSize: '12.5px',
        fontWeight: 500,
      }}
    >
      {icon}
      {label}
    </span>
  );
  return (
    <div style={{display: 'flex', flexDirection: 'column', minHeight: 0}}>
      <div style={{display: 'flex', borderBottom: '2px solid #e9ecef'}}>
        {tab(<IconJson size={17} />, 'JSON', false)}
        {tab(<IconFileDiff size={17} />, 'Diff', true)}
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          paddingTop: '12px',
        }}
      >
        <Diff />
      </div>
    </div>
  );
}

/** The "Edit with AI" modal, open on a module in the doc editor. */
export default function AiEdit() {
  return (
    <div style={{position: 'relative', width: '100%', height: '100%'}}>
      <CmsFrame
        active="content"
        topRight={
          <DocStatusBar
            viewers={['Priya']}
            saveState="Saved 1 min ago"
            badges={[['draft', 'Draft']]}
          />
        }
      >
        <div className="cms-editor" style={{width: '480px'}}>
          <EditorHeader docId="Pages/spring-harvest" />
          <div className="cms-editor__fields">
            <div className="cms-array-item">
              <IconGripVertical />
              <strong>m00:</strong> Hero
              <span className="cms-muted" style={{marginLeft: 'auto'}}>
                TemplateHero
              </span>
            </div>
            <Field label="Eyebrow">
              <Input>{SITE_COPY.eyebrow}</Input>
            </Field>
            <Field label="Title">
              <Input textarea>{SITE_COPY.title}</Input>
            </Field>
            <Field label="Body">
              <RichTextInput>{SITE_COPY.body}</RichTextInput>
            </Field>
            <Field label="Image">
              <div className="cms-image-field">
                <GardenScene className="cms-image-field__thumb" />
                <span style={{fontWeight: 600}}>spring-harvest-hero.jpg</span>
              </div>
            </Field>
          </div>
        </div>
      </CmsFrame>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(233, 236, 239, 0.55)',
          backdropFilter: 'blur(3px)',
        }}
      >
        <div
          className="cms-modal"
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '876px',
            height: '548px',
            padding: '18px 22px 20px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: '14px',
              fontSize: '15px',
              fontWeight: 700,
            }}
          >
            Edit with AI (Experimental)
            <span className="cms-icon-button" style={{marginLeft: 'auto'}}>
              <IconX />
            </span>
          </div>
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gridTemplateRows: '100%',
              gap: '24px',
            }}
          >
            <Chat />
            <Changes />
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              marginTop: '18px',
            }}
          >
            <span className="cms-button">Cancel</span>
            <span className="cms-button">
              <IconArrowBackUp />
              Reset
            </span>
            <span
              className="cms-button"
              style={{
                background: '#40c057',
                borderColor: '#40c057',
                color: '#fff',
              }}
            >
              <IconCheck />
              Accept changes
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
