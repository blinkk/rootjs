import {useEffect, useRef, useState} from 'preact/hooks';
import {useLocation} from 'preact-iso';
import {useLocalStorage} from '../../hooks/useLocalStorage.js';
import {usePageTitle} from '../../hooks/usePageTitle.js';
import {GALLERY_ENTRIES} from './registry.js';
import {applyTestTheme} from './test-theme.js';
import type {GalleryEntry} from './types.js';

/** Viewport widths the gallery can preview side by side. */
const WIDTHS = [375, 768, 1280];

/**
 * Device heights for `screenshot: 'viewport'` entries. Their overlays render
 * outside the stories' content, so those frames get a realistic viewport
 * instead of being sized to the content.
 */
const VIEWPORT_HEIGHTS: Record<number, number> = {
  375: 812,
  768: 1024,
  1280: 800,
};

/** `postMessage` type a frame uses to report its content height. */
const FRAME_HEIGHT_MESSAGE = 'root-cms-gallery-frame-height';

const GROUPS: GalleryEntry['group'][] = [
  'Foundations',
  'Primitives',
  'Components',
];

interface GalleryPageProps {
  entryId?: string;
}

/**
 * The UI gallery at `/cms/_ui` (dev server only). Shows every story of an
 * entry in one iframe per viewport width, so media queries respond to the
 * previewed width rather than the browser window.
 */
export function GalleryPage(props: GalleryPageProps) {
  const {query} = useLocation();
  const entry =
    GALLERY_ENTRIES.find((e) => e.id === props.entryId) ?? GALLERY_ENTRIES[0];
  if (query.frame) {
    return (
      <GalleryFrame
        entry={entry}
        themed={query.theme === 'test'}
        story={query.story}
      />
    );
  }
  return <GalleryShell key={entry.id} entry={entry} />;
}

function GalleryShell(props: {entry: GalleryEntry}) {
  const [widths, setWidths] = useLocalStorage<number[]>(
    'root::GalleryPage:widths',
    WIDTHS
  );
  const [themed, setThemed] = useLocalStorage<boolean>(
    'root::GalleryPage:themed',
    false
  );
  // Overlay stories render open, so they're previewed one at a time rather
  // than stacked on top of each other.
  const isViewport = props.entry.screenshot === 'viewport';
  const storyNames = Object.keys(props.entry.stories);
  const [story, setStory] = useState(storyNames[0]);
  usePageTitle(`${props.entry.name} · UI gallery`);

  function toggleWidth(width: number) {
    setWidths((current) =>
      current.includes(width)
        ? current.filter((w) => w !== width)
        : [...current, width].sort((a, b) => a - b)
    );
  }

  return (
    <div className="GalleryPage flex min-h-screen flex-col bg-page text-fg md:flex-row">
      <nav className="GalleryPage__nav shrink-0 border-b border-border bg-surface p-4 md:w-56 md:border-b-0 md:border-r">
        <h1 className="mb-4 text-base font-semibold text-strong">UI gallery</h1>
        {GROUPS.map((group) => {
          const entries = GALLERY_ENTRIES.filter((e) => e.group === group);
          if (entries.length === 0) {
            return null;
          }
          return (
            <div key={group} className="GalleryPage__navGroup mb-4">
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                {group}
              </h2>
              <ul className="m-0 flex list-none flex-wrap gap-1 p-0 md:flex-col">
                {entries.map((e) => (
                  <li key={e.id}>
                    <a
                      href={`/cms/_ui/${e.id}`}
                      aria-current={
                        e.id === props.entry.id ? 'page' : undefined
                      }
                      className="GalleryPage__navLink block rounded-sm px-2 py-1 text-sm no-underline hover:bg-surface-hover aria-[current=page]:bg-surface-active aria-[current=page]:font-medium"
                    >
                      {e.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>
      <main className="GalleryPage__main min-w-0 flex-1 p-4 md:p-6">
        <div className="GalleryPage__toolbar mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <h2 className="text-xl font-semibold text-strong">
            {props.entry.name}
          </h2>
          <fieldset className="m-0 flex items-center gap-3 border-0 p-0">
            <legend className="sr-only">Viewport widths</legend>
            {WIDTHS.map((width) => (
              <label key={width} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={widths.includes(width)}
                  onChange={() => toggleWidth(width)}
                />
                {width}px
              </label>
            ))}
          </fieldset>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={themed}
              onChange={() => setThemed(!themed)}
            />
            Test theme
          </label>
          {isViewport && (
            <label className="flex items-center gap-2">
              Story
              <select
                value={story}
                onChange={(e) => setStory(e.currentTarget.value)}
              >
                {storyNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="GalleryPage__frames flex items-start gap-4 overflow-x-auto pb-4">
          {widths.map((width) => (
            <GalleryIframe
              key={`${props.entry.id}-${width}-${themed}-${isViewport ? story : ''}`}
              entry={props.entry}
              width={width}
              themed={themed}
              story={isViewport ? story : undefined}
            />
          ))}
        </div>
      </main>
    </div>
  );
}

/**
 * One viewport-width preview, sized to the height of its content (or to a
 * device height, for `screenshot: 'viewport'` entries).
 */
function GalleryIframe(props: {
  entry: GalleryEntry;
  width: number;
  themed: boolean;
  story?: string;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [contentHeight, setContentHeight] = useState(400);
  const height =
    props.entry.screenshot === 'viewport'
      ? Math.max(contentHeight, VIEWPORT_HEIGHTS[props.width] ?? 800)
      : contentHeight;

  // The frame reports its content height once the CMS inside it has booted
  // (see `GalleryFrame`), since the iframe's own body is pinned to 100%.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (
        e.source === ref.current?.contentWindow &&
        e.data?.type === FRAME_HEIGHT_MESSAGE
      ) {
        setContentHeight(e.data.height);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const params = new URLSearchParams({frame: '1'});
  if (props.themed) {
    params.set('theme', 'test');
  }
  if (props.story) {
    params.set('story', props.story);
  }
  return (
    <figure className="GalleryPage__frame shrink-0">
      <figcaption className="mb-1 text-xs text-muted">
        {props.width}px
      </figcaption>
      <iframe
        ref={ref}
        title={`${props.entry.name} at ${props.width}px`}
        src={`/cms/_ui/${props.entry.id}?${params}`}
        width={props.width}
        // Inline, since the base styles set `iframe {height: auto}`.
        style={{height: `${height}px`}}
        // `box-content`, so the border doesn't shrink the previewed viewport.
        className="box-content block rounded-md border border-border bg-surface"
      />
    </figure>
  );
}

/**
 * What renders inside each iframe: every story of the entry, stacked, or
 * just `story` when set.
 */
export function GalleryFrame(props: {
  entry: GalleryEntry;
  themed: boolean;
  story?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    applyTestTheme(props.themed);
    return () => applyTestTheme(false);
  }, [props.themed]);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.parent === window) {
      return;
    }
    const observer = new ResizeObserver(() => {
      window.parent.postMessage(
        {type: FRAME_HEIGHT_MESSAGE, height: el.offsetHeight},
        window.location.origin
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="GalleryFrame flex flex-col gap-8 bg-page p-4 text-fg"
    >
      {Object.entries(props.entry.stories)
        .filter(([name]) => !props.story || name === props.story)
        .map(([name, render]) => (
          <section
            key={name}
            className="GalleryFrame__story flex flex-col gap-2"
            data-story={name}
          >
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
              {name}
            </h3>
            <div className="GalleryFrame__content">{render()}</div>
          </section>
        ))}
    </div>
  );
}
