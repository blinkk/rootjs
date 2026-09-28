import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconArrowLeft,
  IconBraces,
  IconChevronDown,
  IconChevronRight,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconDeviceTablet,
  IconGripVertical,
  IconMessageCircle,
  IconPlanet,
  IconRefresh,
  IconRocket,
  IconSearch,
  IconSparkles,
  IconChecklist,
} from '@tabler/icons-preact';
import type {SceneMeta} from '../types.js';
import {
  Artwork,
  Badge,
  CmsFrame,
  Field,
  Input,
  RichTextInput,
} from '../ui/cms.js';
import {SitePreview} from '../ui/site.js';

export const meta: SceneMeta = {
  id: 'cms-editor-preview',
  width: 1440,
  height: 900,
  alt: 'The Root CMS doc editor, with the fields for a landing page on the left and a live desktop and mobile preview of the page on the right.',
};

/** The doc editor with a live, multi-device preview. Used as the hero image. */
export default function EditorPreview() {
  return (
    <CmsFrame active="content" viewers={['Ada', 'Kenji', 'Priya']}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '500px 1fr',
          height: '100%',
        }}
      >
        <div className="cms-editor">
          <div className="cms-editor__bar">
            <span className="cms-icon-button">
              <IconArrowLeft />
            </span>
            <span className="cms-editor__docid">Pages/spring-launch</span>
            <span className="cms-icon-button">
              <IconArrowBackUp />
            </span>
            <span className="cms-icon-button">
              <IconArrowForwardUp />
            </span>
            <span className="cms-icon-button">
              <IconBraces />
            </span>
          </div>
          <div className="cms-editor__status">
            <span className="cms-editor__saved">Saved just now</span>
            <Badge variant="draft">Draft</Badge>
            <Badge variant="scheduled">Scheduled</Badge>
          </div>
          <div
            className="cms-editor__status"
            style={{justifyContent: 'space-between'}}
          >
            <div className="cms-button-group">
              <span className="cms-button">
                <IconSearch />
              </span>
              <span className="cms-button cms-button--active">
                <IconMessageCircle />3
              </span>
              <span className="cms-button">
                <IconChecklist />
              </span>
              <span className="cms-button">
                <IconSparkles />
                AI
              </span>
            </div>
            <div style={{display: 'flex', gap: '6px'}}>
              <span className="cms-button">
                <IconPlanet />
                Locales (6)
              </span>
              <span className="cms-button cms-button--dark">
                <IconRocket />
                Publish
              </span>
            </div>
          </div>
          <div className="cms-editor__fields">
            <div
              className="cms-drawer"
              style={{borderTop: 'none', paddingTop: 0}}
            >
              <div className="cms-drawer__header">
                <IconChevronRight />
                Meta
                <span className="cms-muted" style={{fontWeight: 400}}>
                  — Spring collection · Lumen Outdoor
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
                  <Input>Spring collection</Input>
                </Field>
                <Field label="Title" comments={2}>
                  <Input focused textarea>
                    Chase the first light of spring
                  </Input>
                </Field>
                <Field label="Body">
                  <RichTextInput>
                    Lightweight layers and trail-tested gear for early mornings,
                    long switchbacks and everything in between.
                  </RichTextInput>
                </Field>
                <Field label="Image" help="Recommended: 2400x1200 JPG.">
                  <div className="cms-image-field">
                    <Artwork
                      variant="dawn"
                      className="cms-image-field__thumb"
                    />
                    <div>
                      <div style={{fontWeight: 600}}>spring-dawn-hero.jpg</div>
                      <div className="cms-muted" style={{fontSize: '11px'}}>
                        2400×1200 · Alt: Sunrise over a mountain ridge
                      </div>
                    </div>
                  </div>
                </Field>
                <div className="cms-array-item">
                  <IconGripVertical />
                  <strong>m01:</strong> Product grid
                  <span className="cms-muted" style={{marginLeft: 'auto'}}>
                    TemplateProductGrid
                  </span>
                </div>
                <div className="cms-array-item">
                  <IconGripVertical />
                  <strong>m02:</strong> Journal highlights
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
              lumen.example/spring-launch/?preview=true
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
              height={540}
              highlightTitle
            />
          </div>
        </div>
      </div>
    </CmsFrame>
  );
}
