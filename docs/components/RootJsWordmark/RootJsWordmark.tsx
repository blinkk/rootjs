import {joinClassNames} from '@/utils/classes.js';
import styles from './RootJsWordmark.module.scss';

/**
 * The 16x16 pixel-art beet used in the Root.js logo and favicon. Each
 * character is one pixel: K=outline, B=body, H=highlight, L=leaf,
 * D=leaf shade, and `.` is transparent.
 */
const BEET_SPRITE = [
  '...DD.....DD....',
  '..DLLD...DLLD...',
  '..DLLLD.DLLLD...',
  '...DLLLDLLLD....',
  '....DDLLLDD.....',
  '......DLD.......',
  '....KKKKKKK.....',
  '...KBBBBBBBK....',
  '..KBHHBBBBBBK...',
  '..KBHBBBBBBBK...',
  '..KBBBBBBBBBK...',
  '..KBBBBBBBBBK...',
  '...KBBBBBBBK....',
  '....KKBBBKK.....',
  '......KBK.......',
  '.......K........',
];

/** Colors for each sprite pixel code. The body matches the platform accent. */
const BEET_PALETTE: Record<string, string> = {
  K: '#2a0f22',
  B: '#6b2f55',
  H: '#b8578f',
  L: '#5bb03c',
  D: '#2d6b1f',
};

/** Columns the sprite actually uses, so the logo can crop the empty edges. */
const CROP = {x: 2, width: 11};

/** Builds one SVG path per color, with a 1x1 square for each pixel. */
function beetPaths() {
  const paths: Record<string, string> = {};
  BEET_SPRITE.forEach((row, y) => {
    row.split('').forEach((code, x) => {
      if (code in BEET_PALETTE) {
        paths[code] = (paths[code] || '') + `M${x} ${y}h1v1h-1z`;
      }
    });
  });
  return Object.entries(paths).map(([code, d]) => ({
    d,
    fill: BEET_PALETTE[code],
  }));
}

const PATHS = beetPaths();

export interface BeetSpriteProps {
  className?: string;
  /** Whether to crop the empty columns on either side of the sprite. */
  crop?: boolean;
}

/** The pixel-art beet mark. Size it with CSS (e.g. `height`). */
export function BeetSprite(props: BeetSpriteProps) {
  const viewBox = props.crop ? `${CROP.x} 0 ${CROP.width} 16` : '0 0 16 16';
  return (
    <svg
      className={props.className}
      viewBox={viewBox}
      shape-rendering="crispEdges"
      aria-hidden="true"
    >
      {PATHS.map((path) => (
        <path d={path.d} fill={path.fill} />
      ))}
    </svg>
  );
}

/** The beet mark as an SVG data URI, e.g. for the favicon. */
export function beetMarkDataUri() {
  const paths = PATHS.map((p) => `<path d="${p.d}" fill="${p.fill}"/>`).join(
    ''
  );
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">${paths}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export interface RootJsWordmarkProps {
  className?: string;
}

/**
 * The Root.js logo lockup: the pixel beet followed by "Root.js" in Inter
 * ExtraBold. Size it with `font-size`; the beet scales with the text, or set
 * `--beet-size` to pin it to a whole-pixel multiple of 16 for crisp edges.
 */
export function RootJsWordmark(props: RootJsWordmarkProps) {
  return (
    <span
      className={joinClassNames(props.className, styles.wordmark)}
      role="img"
      aria-label="Root.js"
    >
      <BeetSprite className={styles.beet} crop />
      <span className={styles.text} aria-hidden="true">
        Root.js
      </span>
    </span>
  );
}
