import {
  IconChevronDown,
  IconChevronRight,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconDeviceTablet,
  IconGripVertical,
  IconRefresh,
} from '@tabler/icons-preact';
import type {SceneMeta} from '../types.js';
import {
  CmsFrame,
  DocStatusBar,
  EditorHeader,
  Field,
  Input,
  PROJECT_NAME,
  RichTextInput,
} from '../ui/cms.js';
import {GardenScene} from '../ui/garden.js';
import {SITE_COPY, SitePreview} from '../ui/site.js';

export const meta: SceneMeta = {
  id: 'cms-editor-preview',
  width: 1440,
  height: 900,
  alt: 'The Root.js CMS doc editor, with the fields for a garden market landing page on the left and a live desktop and mobile preview of the page on the right.',
};

/** The doc editor with a live, multi-device preview. Used as the hero image. */
export default function EditorPreview() {
  return (
    <CmsFrame
      active="content"
      topRight={
        <DocStatusBar
          viewers={['Ada', 'Kenji', 'Priya']}
          saveState="Saved just now"
          badges={[
            ['draft', 'Draft'],
            ['scheduled', 'Scheduled'],
          ]}
          activeTool="comments"
          comments={3}
        />
      }
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '500px 1fr',
          height: '100%',
        }}
      >
        <div className="cms-editor">
          <EditorHeader docId="Pages/spring-harvest" />
          <div className="cms-editor__fields">
            <div
              className="cms-drawer"
              style={{borderTop: 'none', paddingTop: 0}}
            >
              <div className="cms-drawer__header">
                <IconChevronRight />
                Meta
                <span className="cms-muted" style={{fontWeight: 400}}>
                  — Spring harvest · {PROJECT_NAME}
                </span>
              </div>
            </div>
            <div className="cms-drawer">
              <div className="cms-drawer__header">
                <IconChevronDown />
                Content
              </div>
              <div className="cms-drawer__body">
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
                <Field label="Title" comments={2}>
                  <Input focused textarea>
                    {SITE_COPY.title}
                  </Input>
                </Field>
                <Field label="Body">
                  <RichTextInput>{SITE_COPY.body}</RichTextInput>
                </Field>
                <Field label="Image" help="Recommended: 2400x1200 JPG.">
                  <div className="cms-image-field">
                    <GardenScene className="cms-image-field__thumb" />
                    <div>
                      <div style={{fontWeight: 600}}>
                        spring-harvest-hero.jpg
                      </div>
                      <div className="cms-muted" style={{fontSize: '11px'}}>
                        2400×1200 · Alt: Rows of carrots and beets in a garden
                        bed
                      </div>
                    </div>
                  </div>
                </Field>
                <div className="cms-array-item">
                  <IconGripVertical />
                  <strong>m01:</strong> Fresh this week
                  <span className="cms-muted" style={{marginLeft: 'auto'}}>
                    TemplateProductGrid
                  </span>
                </div>
                <div className="cms-array-item">
                  <IconGripVertical />
                  <strong>m02:</strong> Root vegetable recipes
                  <span className="cms-muted" style={{marginLeft: 'auto'}}>
                    TemplateCards
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="cms-preview">
          <div className="cms-preview__bar">
            <span className="cms-icon-button cms-button--active">
              <IconDeviceDesktop />
            </span>
            <span className="cms-icon-button">
              <IconDeviceTablet />
            </span>
            <span className="cms-icon-button cms-button--active">
              <IconDeviceMobile />
            </span>
            <span className="cms-preview__url">
              fernwood.example/spring-harvest/?preview=true
            </span>
            <span className="cms-chip">EN</span>
            <span className="cms-icon-button">
              <IconRefresh />
            </span>
          </div>
          <div className="cms-preview__frames">
            <SitePreview
              device="desktop"
              width={560}
              height={760}
              highlightTitle
            />
            <SitePreview
              device="mobile"
              width={260}
              height={560}
              highlightTitle
            />
          </div>
        </div>
      </div>
    </CmsFrame>
  );
}
