import {IconArrowRight, IconX} from '@tabler/icons-preact';
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
import {VEGGIE_TINTS, Veggie} from '../ui/garden.js';
import type {VeggieKind} from '../ui/garden.js';
import {SITE_COPY} from '../ui/site.js';

export const meta: SceneMeta = {
  id: 'cms-doc-changes',
  width: 960,
  height: 600,
  alt: 'The unpublished changes to a page in the Root.js CMS, listed field by field: an edited title, a word-level change to the body copy, a replaced hero image, and reordered modules.',
};

/** Styles matching the CMS's `DocChanges` component. */
const DOC_CHANGES_CSS = `
.dc {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12.5px;
  line-height: 1.5;
}
.dc__change {
  border: 1px solid var(--cms-border);
  border-left: 3px solid #54aeff;
  border-radius: 6px;
  background: #fff;
}
.dc__change--added { border-left-color: #4ac26b; }
.dc__change--reordered { border-left-color: #c297ff; }
.dc__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--cms-border);
  background: #f8f9fa;
  border-radius: 0 6px 0 0;
  font-size: 11.5px;
}
.dc__path { flex: 1; color: #868e96; }
.dc__path b { color: #1a1b1e; font-weight: 600; }
.dc__path i { font-style: normal; color: #adb5bd; padding: 0 4px; }
.dc__badge {
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 600;
  background: #ddf4ff;
  color: #0550ae;
}
.dc__badge--added { background: #dafbe1; color: #116329; }
.dc__badge--reordered { background: #fbefff; color: #6639ba; }
.dc__body { padding: 6px 12px; }
.dc ins, .dc del { text-decoration: none; border-radius: 3px; }
.dc ins { background: #dafbe1; color: #116329; }
.dc del {
  background: #ffebe9;
  color: #82071e;
  text-decoration: line-through;
  text-decoration-color: rgba(130, 7, 30, 0.4);
}
.dc__pair { display: flex; align-items: center; gap: 6px; }
.dc__pair ins, .dc__pair del { padding: 1px 6px; }
.dc__arrow { color: #868e96; display: flex; }
.dc__arrow svg { width: 14px; height: 14px; }
.dc__files { display: flex; align-items: center; gap: 12px; }
.dc__file {
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 120px;
  padding: 4px;
  border-radius: 6px;
}
.dc__file--removed { border: 1px solid #ff8182; background: #ffebe9; }
.dc__file--removed .dc__thumb { opacity: 0.6; }
.dc__file--added { border: 1px solid #4ac26b; background: #dafbe1; }
.dc__thumb {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  height: 44px;
  border-radius: 4px;
  overflow: hidden;
}
.dc__name { font-size: 10.5px; font-weight: 600; }
.dc__order { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.dc__label { font-size: 10.5px; font-weight: 600; color: #868e96; }
.dc__order ol { margin: 0; padding-left: 18px; line-height: 1.4; }
.dc__order .moved { font-weight: 600; }
.dc__toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.dc__segmented {
  display: inline-flex;
  padding: 2px;
  border-radius: 6px;
  background: #f1f3f5;
  font-size: 11.5px;
  font-weight: 500;
}
.dc__segmented span { padding: 2px 12px; border-radius: 4px; color: #495057; }
.dc__segmented .active {
  background: #fff;
  color: #1a1b1e;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}
.dc__count { font-size: 11.5px; color: #868e96; }
`;

type ChangeType = 'modified' | 'added' | 'reordered';

const BADGES: Record<ChangeType, string> = {
  modified: 'Changed',
  added: 'Added',
  reordered: 'Reordered',
};

/** A single change card: a breadcrumb path, a badge, and the change body. */
function Change(props: {
  type: ChangeType;
  path: string[];
  children: ComponentChildren;
}) {
  const last = props.path.length - 1;
  return (
    <div className={`dc__change dc__change--${props.type}`}>
      <div className="dc__header">
        <span className="dc__path">
          {props.path.map((segment, i) => (
            <>
              {i > 0 && <i>›</i>}
              {i === last ? <b>{segment}</b> : segment}
            </>
          ))}
        </span>
        <span className={`dc__badge dc__badge--${props.type}`}>
          {BADGES[props.type]}
        </span>
      </div>
      <div className="dc__body">{props.children}</div>
    </div>
  );
}

/** An image before or after the change. */
function FileCard(props: {
  kind: VeggieKind;
  name: string;
  state: 'added' | 'removed';
}) {
  return (
    <div className={`dc__file dc__file--${props.state}`}>
      <div className="dc__thumb" style={{background: VEGGIE_TINTS[props.kind]}}>
        <Veggie kind={props.kind} size={34} />
      </div>
      <div className="dc__name">{props.name}</div>
    </div>
  );
}

/** The "Unpublished changes" modal, open over the doc editor. */
export default function DocChanges() {
  return (
    <CmsFrame
      active="content"
      topRight={
        <DocStatusBar
          viewers={['Kenji']}
          saveState="Saved just now"
          badges={[
            ['draft', 'Draft'],
            ['published', 'Published'],
          ]}
        />
      }
    >
      <style>{DOC_CHANGES_CSS}</style>
      <div style={{position: 'relative', height: '100%'}}>
        <div className="cms-editor" style={{width: '400px', height: '100%'}}>
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
          </div>
        </div>
        <div
          className="cms-modal-overlay"
          style={{alignItems: 'flex-start', paddingTop: '14px'}}
        >
          <div className="cms-modal" style={{width: '680px'}}>
            <div
              className="cms-modal__title"
              style={{justifyContent: 'space-between'}}
            >
              <span>Unpublished changes: Pages/spring-harvest</span>
              <span className="cms-icon-button">
                <IconX />
              </span>
            </div>
            <div style={{padding: '10px 20px 14px'}}>
              <div className="dc__toolbar">
                <span className="dc__segmented">
                  <span className="active">Changes</span>
                  <span>JSON</span>
                </span>
                <span className="dc__count">4 changes</span>
              </div>
              <div className="dc">
                <Change type="modified" path={['Hero', 'Title']}>
                  <div className="dc__pair">
                    <del>Fresh from the garden</del>
                    <span className="dc__arrow">
                      <IconArrowRight />
                    </span>
                    <ins>{SITE_COPY.title}</ins>
                  </div>
                </Change>
                <Change type="modified" path={['Hero', 'Body']}>
                  Heirloom carrots, candy-striped beets and <del>crisp</del>
                  <ins>peppery</ins> radishes, <del>picked on Saturdays</del>
                  <ins>pulled this morning</ins> by growers just down the road.
                </Change>
                <Change type="modified" path={['Hero', 'Image']}>
                  <div className="dc__files">
                    <FileCard
                      kind="carrot"
                      name="carrots.png"
                      state="removed"
                    />
                    <span className="dc__arrow">
                      <IconArrowRight />
                    </span>
                    <FileCard kind="beet" name="beets.png" state="added" />
                  </div>
                </Change>
                <Change type="reordered" path={['Modules']}>
                  <div className="dc__order">
                    <div>
                      <div className="dc__label">Before</div>
                      <ol>
                        <li>Hero: Dig into the spring harvest</li>
                        <li>Products: Fresh this week</li>
                        <li>Cards: Root vegetable recipes</li>
                      </ol>
                    </div>
                    <div>
                      <div className="dc__label">After</div>
                      <ol>
                        <li>Hero: Dig into the spring harvest</li>
                        <li className="moved">Cards: Root vegetable recipes</li>
                        <li className="moved">Products: Fresh this week</li>
                      </ol>
                    </div>
                  </div>
                </Change>
              </div>
            </div>
          </div>
        </div>
      </div>
    </CmsFrame>
  );
}
