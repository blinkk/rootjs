import {
  IconAlertTriangle,
  IconCalendarEvent,
  IconCircleCheck,
  IconRocket,
} from '@tabler/icons-preact';
import type {SceneMeta} from '../types.js';
import {CmsFrame, DocStatusBar, EditorHeader, Field, Input} from '../ui/cms.js';

export const meta: SceneMeta = {
  id: 'cms-publish-checks',
  width: 960,
  height: 600,
  alt: 'The publish dialog in Root CMS, showing a scheduled publish time, an AI-written change summary and passing publishing checks.',
};

const CHECKS: Array<{label: string; status: 'pass' | 'warn'; message: string}> =
  [
    {label: 'Translations', status: 'pass', message: 'All 6 locales complete'},
    {label: 'Broken links', status: 'pass', message: '0 broken links'},
    {
      label: 'Image alt text',
      status: 'pass',
      message: 'All 7 images have alt text',
    },
    {
      label: 'Referenced docs',
      status: 'warn',
      message: 'GlobalModules/footer has unpublished changes',
    },
  ];

/** The publish modal, open on top of the doc editor. */
export default function PublishChecks() {
  return (
    <CmsFrame
      active="content"
      topRight={
        <DocStatusBar
          saveState="Saved 2 min ago"
          badges={[['draft', 'Draft']]}
        />
      }
    >
      <div style={{position: 'relative', height: '100%'}}>
        <div className="cms-editor" style={{width: '420px'}}>
          <EditorHeader docId="Pages/spring-harvest" />
          <div className="cms-editor__fields">
            <Field label="Title">
              <Input>Dig into the spring harvest</Input>
            </Field>
            <Field label="Eyebrow">
              <Input>Spring harvest</Input>
            </Field>
          </div>
        </div>
        <div className="cms-modal-overlay">
          <div className="cms-modal" style={{width: '560px'}}>
            <div className="cms-modal__title">
              <IconRocket size={18} />
              Publish Pages/spring-harvest
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                padding: '16px 20px 20px',
              }}
            >
              <div style={{display: 'flex', gap: '8px'}}>
                <span className="cms-button">Publish now</span>
                <span className="cms-button cms-button--active">
                  <IconCalendarEvent />
                  Schedule
                </span>
                <span className="cms-button">Add to release</span>
              </div>
              <Field label="Publish at">
                <Input>Mar 3, 2027 · 9:00 AM (America/Los_Angeles)</Input>
              </Field>
              <Field label="Publish message" help="Suggested by Root AI.">
                <Input textarea>
                  Launch the spring harvest hero with new garden artwork,
                  updated CTAs and German and French translations.
                </Input>
              </Field>
              <div>
                <div className="cms-field__label" style={{marginBottom: '6px'}}>
                  Publishing checks
                </div>
                <div className="cms-panel">
                  {CHECKS.map((check, i) => (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '9px 12px',
                        borderTop: i === 0 ? 'none' : '1px solid #f1f3f5',
                      }}
                    >
                      {check.status === 'pass' ? (
                        <IconCircleCheck size={17} color="#2f9e44" />
                      ) : (
                        <IconAlertTriangle size={17} color="#f08c00" />
                      )}
                      <span style={{fontWeight: 600, width: '120px'}}>
                        {check.label}
                      </span>
                      <span className="cms-muted">{check.message}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '8px',
                  marginTop: '4px',
                }}
              >
                <span className="cms-button">Cancel</span>
                <span className="cms-button cms-button--dark">
                  <IconCalendarEvent />
                  Schedule publish
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </CmsFrame>
  );
}
