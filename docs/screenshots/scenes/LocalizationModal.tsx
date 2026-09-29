import {
  IconArrowUpRight,
  IconCheck,
  IconChevronDown,
  IconFilter,
  IconLanguage,
  IconMapPin,
  IconRobot,
  IconTool,
  IconX,
} from '@tabler/icons-preact';
import type {ComponentChildren} from 'preact';
import type {SceneMeta} from '../types.js';
import {
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
  id: 'cms-localization-modal',
  width: 960,
  height: 600,
  alt: 'The localization settings for a page in the Root.js CMS, with the locales it is published in grouped by region and its source strings next to their Japanese translations, three of which are still missing.',
};

/** Locale groups, as configured with `i18n.groups` in `root.config.ts`. */
const GROUPS: Array<{label: string; locales: Array<[string, boolean]>}> = [
  {
    label: 'Americas',
    locales: [
      ['English (en)', true],
      ['Spanish (es)', false],
    ],
  },
  {
    label: 'EMEA',
    locales: [
      ['German (de)', true],
      ['French (fr)', true],
      ['Italian (it)', false],
    ],
  },
  {
    label: 'JAPAC',
    locales: [
      ['Japanese (ja)', true],
      ['Korean (ko)', false],
    ],
  },
];

/** Source strings on the page and their Japanese translations. */
const ROWS: Array<[string, string]> = [
  [SITE_COPY.eyebrow, '春の収穫'],
  [SITE_COPY.title, '春の収穫を味わおう'],
  [SITE_COPY.body, ''],
  [SITE_COPY.primaryCta, 'マーケットで買う'],
  [SITE_COPY.secondaryCta, ''],
  ['Fresh this week', ''],
];

const BORDER = '#e4e4e1';

/** A Mantine "xs" checkbox. */
function Checkbox(props: {checked: boolean; label: string}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '12px',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '16px',
          height: '16px',
          borderRadius: '4px',
          border: props.checked ? '1px solid #228be6' : '1px solid #ced4da',
          background: props.checked ? '#228be6' : '#fff',
          color: '#fff',
        }}
      >
        {props.checked && <IconCheck size={11} stroke={3} />}
      </span>
      {props.label}
    </span>
  );
}

/** The subtle "All / None" buttons shown next to each locale group. */
function AllNone() {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '12px',
        fontWeight: 600,
        color: '#adb5bd',
      }}
    >
      <span style={{color: '#228be6'}}>All</span>/
      <span style={{color: '#228be6'}}>None</span>
    </span>
  );
}

/** A heading with a leading icon, as used for both modal columns. */
function IconTitle(props: {icon: ComponentChildren; children: string}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '19px',
        fontWeight: 700,
        letterSpacing: '-0.2px',
      }}
    >
      {props.icon}
      {props.children}
    </div>
  );
}

/** The locale checkboxes, grouped by region. */
function Locales() {
  return (
    <div style={{paddingRight: '26px', paddingTop: '8px'}}>
      <div style={{display: 'flex', alignItems: 'center', gap: '14px'}}>
        <IconTitle icon={<IconMapPin size={22} stroke={1.5} />}>
          Locales
        </IconTitle>
        <AllNone />
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '26px',
          marginTop: '26px',
        }}
      >
        {GROUPS.map((group) => (
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '12px',
              }}
            >
              <span style={{fontSize: '13px', fontWeight: 600}}>
                {group.label}
              </span>
              <AllNone />
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                rowGap: '12px',
                columnGap: '8px',
              }}
            >
              {group.locales.map(([label, checked]) => (
                <Checkbox label={label} checked={checked} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The doc's source strings next to the selected locale's translations. */
function Translations() {
  const missing = ROWS.filter(([, ja]) => !ja).length;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        borderLeft: `1px solid ${BORDER}`,
        paddingLeft: '26px',
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          paddingTop: '8px',
          paddingBottom: '14px',
        }}
      >
        <IconTitle icon={<IconLanguage size={22} stroke={1.5} />}>
          Translations
        </IconTitle>
        <span style={{flex: 1}} />
        <span className="cms-button" style={{height: '28px'}}>
          Open Editor
          <IconArrowUpRight />
        </span>
        <span className="cms-button" style={{height: '28px'}}>
          Import
          <IconChevronDown />
        </span>
        <span className="cms-button" style={{height: '28px'}}>
          Export
          <IconChevronDown />
        </span>
        <span
          className="cms-button"
          style={{width: '28px', padding: 0, justifyContent: 'center'}}
        >
          <IconTool />
        </span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          alignItems: 'center',
          paddingBottom: '8px',
          marginBottom: '10px',
          borderBottom: `1px solid ${BORDER}`,
          fontSize: '12px',
          fontWeight: 600,
        }}
      >
        <span>SOURCE STRING</span>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            paddingLeft: '8px',
          }}
        >
          LOCALE:
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '128px',
              height: '26px',
              padding: '0 8px',
              border: '1px solid #ced4da',
              borderRadius: '4px',
              fontWeight: 400,
            }}
          >
            Japanese (ja)
            <IconChevronDown size={14} color="#868e96" />
          </span>
          <span style={{flex: 1}} />
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 8px',
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }}
          >
            <IconFilter size={14} />
            {missing} missing
          </span>
          <span
            className="cms-button"
            style={{
              width: '26px',
              height: '26px',
              padding: 0,
              justifyContent: 'center',
            }}
            title="Generate translations using AI"
          >
            <IconRobot />
          </span>
        </span>
      </div>
      <div style={{display: 'flex', flexDirection: 'column'}}>
        {ROWS.map(([source, ja], i) => (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              borderTop: i === 0 ? 'none' : `1px solid ${BORDER}`,
              paddingTop: i === 0 ? 0 : '8px',
              marginTop: i === 0 ? 0 : '8px',
              fontSize: '12px',
              lineHeight: '17px',
            }}
          >
            <div
              style={{
                background: '#f8f9fa',
                border: '1px solid #dee2e6',
                borderRadius: '4px',
                padding: '8px 14px',
              }}
            >
              {source}
            </div>
            <div style={{padding: '0 0 0 8px'}}>
              <div
                style={{
                  height: '100%',
                  minHeight: '35px',
                  padding: '8px 10px',
                  border: '1px solid #ced4da',
                  borderRadius: '4px',
                  background: ja ? '#fff' : '#fff5f5',
                }}
              >
                {ja}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginTop: 'auto',
          padding: '10px 0 14px',
          borderTop: `1px solid ${BORDER}`,
        }}
      >
        <span
          className="cms-button cms-button--dark"
          style={{opacity: 0.45, height: '28px'}}
        >
          <IconCheck />
          Save
        </span>
      </div>
    </div>
  );
}

/** The localization modal, open on top of the doc editor. */
export default function LocalizationModal() {
  return (
    <div style={{position: 'relative', width: '100%', height: '100%'}}>
      <CmsFrame
        active="content"
        topRight={
          <DocStatusBar
            viewers={['Lea', 'Kenji']}
            saveState="Saved just now"
            badges={[
              ['draft', 'Draft'],
              ['scheduled', 'Scheduled'],
            ]}
          />
        }
      >
        <div className="cms-editor" style={{width: '480px'}}>
          <EditorHeader docId="Pages/spring-harvest" />
          <div className="cms-editor__fields">
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
            position: 'relative',
            display: 'grid',
            gridTemplateColumns: '236px 1fr',
            gridTemplateRows: '100%',
            width: '852px',
            height: '524px',
            padding: '30px 28px 0',
          }}
        >
          <span
            className="cms-icon-button"
            style={{position: 'absolute', top: '8px', right: '8px'}}
          >
            <IconX />
          </span>
          <Locales />
          <Translations />
        </div>
      </div>
    </div>
  );
}
