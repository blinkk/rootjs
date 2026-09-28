import {
  IconChevronDown,
  IconCircleCheck,
  IconPaperclip,
  IconPlus,
  IconRobot,
  IconSend,
} from '@tabler/icons-preact';
import type {SceneMeta} from '../types.js';
import {CmsFrame} from '../ui/cms.js';

export const meta: SceneMeta = {
  id: 'cms-root-ai',
  width: 960,
  height: 600,
  alt: 'Root AI chat in the CMS: a request to localize a page and add it to a release, with the tool calls Root AI ran to do it.',
};

const HISTORY = [
  'Localize spring harvest',
  'Draft seed swap banner',
  'Audit alt text on /produce',
  'Summarize last week’s edits',
  'Root cellar guide outline',
];

const STEPS = [
  {tool: 'doc_get', detail: 'Pages/spring-harvest'},
  {tool: 'doc_edit', detail: 'Pages/spring-harvest · 12 strings → de, fr'},
  {tool: 'release_update', detail: 'spring-harvest-2027 · +1 doc'},
];

/** The Root AI chat page, mid-conversation. */
export default function RootAi() {
  return (
    <CmsFrame active="ai">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '220px 1fr',
          height: '100%',
          fontSize: '12.5px',
        }}
      >
        <aside
          style={{
            background: '#fff',
            borderRight: '1px solid var(--cms-border)',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          <span
            className="cms-button"
            style={{justifyContent: 'center', marginBottom: '10px'}}
          >
            <IconPlus />
            New chat
          </span>
          {HISTORY.map((title, i) => (
            <div
              style={{
                padding: '7px 10px',
                borderRadius: '6px',
                background: i === 0 ? '#f1f3f5' : 'transparent',
                fontWeight: i === 0 ? 600 : 400,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {title}
            </div>
          ))}
        </aside>
        <section
          style={{
            display: 'flex',
            flexDirection: 'column',
            padding: '20px 32px',
            gap: '16px',
          }}
        >
          <div
            style={{
              alignSelf: 'flex-end',
              maxWidth: '440px',
              padding: '10px 14px',
              borderRadius: '14px 14px 4px 14px',
              background: '#e7f5ff',
              lineHeight: 1.5,
            }}
          >
            Translate the spring harvest page into German and French, keep the
            variety names as-is, then add it to the Spring Harvest release.
          </div>
          <div style={{display: 'flex', gap: '10px'}}>
            <span
              style={{
                flex: '0 0 26px',
                height: '26px',
                borderRadius: '50%',
                background: '#1c7ed6',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <IconRobot size={16} />
            </span>
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div
                className="cms-panel"
                style={{padding: '4px 0', maxWidth: '520px'}}
              >
                {STEPS.map((step) => (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '7px 12px',
                    }}
                  >
                    <IconCircleCheck size={16} color="#2f9e44" />
                    <span
                      className="cms-mono"
                      style={{fontSize: '11.5px', fontWeight: 500}}
                    >
                      {step.tool}
                    </span>
                    <span className="cms-muted">{step.detail}</span>
                  </div>
                ))}
              </div>
              <div style={{lineHeight: 1.6, maxWidth: '540px'}}>
                Done. I translated all 12 strings on{' '}
                <strong>Pages/spring-harvest</strong> into German and French,
                leaving “Chioggia”, “Purple Top” and “Garnet” as-is. The page is
                now part of the <strong>Spring Harvest</strong> release,
                scheduled for Mar 3 at 7:00 AM.
              </div>
              <div style={{display: 'flex', gap: '6px'}}>
                <span className="cms-chip">Review translations</span>
                <span className="cms-chip">Open release</span>
              </div>
            </div>
          </div>
          <div style={{marginTop: 'auto'}}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 10px 10px 16px',
                border: '1px solid var(--cms-border)',
                borderRadius: '24px',
                background: '#fff',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
              }}
            >
              <IconPaperclip size={17} color="#868e96" />
              <span className="cms-muted" style={{flex: 1}}>
                Ask Root AI to find, edit or publish content…
              </span>
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '30px',
                  height: '30px',
                  borderRadius: '50%',
                  background: '#222',
                  color: '#fff',
                }}
              >
                <IconSend size={15} />
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                gap: '8px',
                marginTop: '8px',
                paddingLeft: '8px',
              }}
            >
              <span className="cms-button cms-button--ghost">
                Claude Sonnet 5
                <IconChevronDown />
              </span>
              <span className="cms-button cms-button--ghost">
                Mode: Approve
                <IconChevronDown />
              </span>
            </div>
          </div>
        </section>
      </div>
    </CmsFrame>
  );
}
