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

/** Colors for each sprite pixel code. */
const BEET_PALETTE: Record<string, string> = {
  K: '#2a0f22',
  B: '#6b2f55',
  H: '#b8578f',
  L: '#5bb03c',
  D: '#2d6b1f',
};

/** Columns the sprite actually uses, so a logo can crop the empty edges. */
export const BEET_CROP = {x: 2, width: 11};

/** An SVG path that draws every pixel of a single color. */
export interface BeetPath {
  d: string;
  fill: string;
}

/** Builds one SVG path per color, with a 1x1 square for each pixel. */
function buildBeetPaths(): BeetPath[] {
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

/** The SVG paths that draw the beet in a `0 0 16 16` viewBox. */
export const BEET_PATHS = buildBeetPaths();

/** Returns the beet mark as an SVG data URI, e.g. for the favicon. */
export function beetMarkDataUri(): string {
  const paths = BEET_PATHS.map(
    (p) => `<path d="${p.d}" fill="${p.fill}"/>`
  ).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">${paths}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
