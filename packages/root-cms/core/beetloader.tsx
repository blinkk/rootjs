import type {JSX} from 'preact';
import {
  BEET_BODY_PATHS,
  BEET_LEAF_PATHS,
  BeetPath,
  spritePaths,
} from '../shared/beet.js';

/**
 * A "beetloader" is an animated beet shown on the "bootstrap" screen. One is
 * picked at random for each page load, on the server, so only its css is
 * inlined.
 *
 * The screen is up while the js bundle is parsed, so the animations must not
 * need the main thread: they're css-only and animate just `transform` and
 * `opacity`, with each moving part in its own layer. `step-end` timing holds
 * each frame, and because `1em` is one sprite pixel, every move lands on the
 * pixel grid. The base styles are each animation's still frame, which is what
 * `prefers-reduced-motion` shows.
 */
export interface Beetloader {
  id: string;
  /** Styles for this beetloader, including the shared `BASE_CSS`. */
  css: string;
  Component: () => JSX.Element;
}

/** Styles shared by every beetloader. */
const BASE_CSS = `
.beetloader {
  position: relative;
  flex: none;
  width: 24em;
  height: 24em;
  font-size: 8px;
  opacity: 0;
  animation: beetloader-fade-in 150ms ease 150ms forwards;
}

.beetloader > *,
.beetloader__beet > * {
  position: absolute;
}

.beetloader__beet {
  left: 4.5em;
  top: 4em;
  width: 16em;
  height: 18em;
}

.beetloader svg {
  position: absolute;
  left: 0;
  top: 0;
  width: 16em;
  height: 18em;
}

.beetloader__layer {
  will-change: transform, opacity;
}

.beetloader__group {
  inset: 0;
}

.beetloader__ground {
  height: 1em;
  background: var(--cms-color-border-strong, #cfcfcb);
}

@keyframes beetloader-fade-in {
  to {
    opacity: 1;
  }
}

@media (max-width: 480px) {
  .beetloader {
    font-size: 6px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .beetloader {
    opacity: 1;
  }

  .beetloader,
  .beetloader * {
    animation: none !important;
  }
}
`;

const HOP_CSS = `
.beetloader--hop .beetloader__beet {
  top: 5em;
  animation: beetloader-hop 1s step-end infinite;
}

.beetloader--hop .beetloader__leaves {
  animation: beetloader-hop-leaves 1s step-end infinite;
}

.beetloader--hop .beetloader__ground {
  left: 7em;
  top: 21em;
  width: 10em;
  animation: beetloader-hop-shadow 1s step-end infinite;
}

@keyframes beetloader-hop {
  0%, 10% { transform: none; }
  20% { transform: translateY(-2em); }
  30% { transform: translateY(-4em); }
  40%, 50% { transform: translateY(-5em); }
  60% { transform: translateY(-4em); }
  70% { transform: translateY(-2em); }
  80% { transform: none; }
}

@keyframes beetloader-hop-leaves {
  0% { transform: none; }
  10%, 20%, 30% { transform: translateY(1em); }
  40%, 50% { transform: none; }
  60%, 70% { transform: translateY(-1em); }
  80% { transform: translateY(2em); }
  90% { transform: translateY(1em); }
}

@keyframes beetloader-hop-shadow {
  0%, 10%, 80% { transform: none; }
  20%, 70% { transform: scaleX(0.8); }
  30%, 60% { transform: scaleX(0.6); }
  40%, 50% { transform: scaleX(0.4); }
}
`;

const PEEKABOO_CSS = `
.beetloader--peekaboo .beetloader__window {
  left: 0;
  top: 0;
  width: 24em;
  height: 20em;
  overflow: hidden;
}

.beetloader--peekaboo .beetloader__beet {
  position: absolute;
  animation: beetloader-peekaboo 3s step-end infinite;
}

.beetloader--peekaboo .beetloader__ground {
  left: 2em;
  top: 20em;
  width: 20em;
}

.beetloader--peekaboo .beetloader__crumbs {
  left: 4.5em;
  top: 4em;
  color: var(--cms-color-border-strong, #cfcfcb);
  opacity: 0;
  animation: beetloader-peekaboo-crumbs 3s step-end infinite;
}

@keyframes beetloader-peekaboo {
  0% { transform: translateY(16em); }
  12% { transform: translateY(13em); }
  18% { transform: translateY(11em); }
  24% { transform: translate(1em, 11em); }
  28% { transform: translate(-1em, 11em); }
  32% { transform: translateY(11em); }
  38% { transform: translateY(8em); }
  42% { transform: translateY(6em); }
  46% { transform: translateY(5em); }
  56% { transform: translate(1em, 5em); }
  62% { transform: translate(-1em, 5em); }
  68% { transform: translateY(5em); }
  80% { transform: translateY(4em); }
  83% { transform: translateY(8em); }
  85% { transform: translateY(13em); }
  87% { transform: translateY(16em); }
}

@keyframes beetloader-peekaboo-crumbs {
  0%, 90% { opacity: 0; transform: none; }
  85% { opacity: 1; transform: none; }
  88% { opacity: 1; transform: translateY(-1em); }
}
`;

const SPROUT_CSS = `
.beetloader--sprout .beetloader__ground {
  left: 4em;
  top: 20em;
  width: 16em;
}

.beetloader__sprout-1,
.beetloader__sprout-2,
.beetloader__sprout-3,
.beetloader__sparkles {
  opacity: 0;
}

.beetloader__sprout-1 {
  animation: beetloader-sprout-1 3s step-end infinite;
}

.beetloader__sprout-2 {
  animation: beetloader-sprout-2 3s step-end infinite;
}

.beetloader__sprout-3 {
  animation: beetloader-sprout-3 3s step-end infinite;
}

.beetloader__sprout-grown {
  animation: beetloader-sprout-grown 3s step-end infinite;
}

.beetloader__sparkles {
  animation: beetloader-sprout-sparkles 3s step-end infinite;
}

@keyframes beetloader-sprout-1 {
  0%, 24% { opacity: 0; }
  6% { opacity: 1; }
}

@keyframes beetloader-sprout-2 {
  0%, 40% { opacity: 0; }
  24% { opacity: 1; }
}

@keyframes beetloader-sprout-3 {
  0%, 56% { opacity: 0; }
  40% { opacity: 1; }
}

@keyframes beetloader-sprout-grown {
  0%, 94% { opacity: 0; transform: none; }
  56% { opacity: 1; transform: translateY(-1em); }
  60% { opacity: 1; transform: none; }
}

@keyframes beetloader-sprout-sparkles {
  0%, 70%, 82% { opacity: 0; }
  62%, 76% { opacity: 1; }
}
`;

const STROLL_CSS = `
.beetloader--stroll .beetloader__window {
  left: 0;
  top: 0;
  width: 24em;
  height: 24em;
  overflow: hidden;
}

.beetloader--stroll .beetloader__beet {
  position: absolute;
  top: 3em;
}

.beetloader--stroll .beetloader__ground {
  position: absolute;
  left: 0;
  top: 20em;
  width: 48em;
  background: repeating-linear-gradient(
    90deg,
    var(--cms-color-border-strong, #cfcfcb) 0 5em,
    transparent 5em 6em,
    var(--cms-color-border-strong, #cfcfcb) 6em 7em,
    transparent 7em 12em
  );
  animation: beetloader-stroll-ground 0.96s steps(12, end) infinite;
}

.beetloader--stroll .beetloader__body {
  animation: beetloader-stroll-body 0.32s step-end infinite;
}

.beetloader--stroll .beetloader__leaves {
  animation: beetloader-stroll-leaves 0.32s step-end infinite;
}

.beetloader__leg {
  animation: beetloader-stroll-leg 0.64s step-end infinite;
}

.beetloader__leg--right {
  animation-delay: -0.32s;
}

@keyframes beetloader-stroll-ground {
  to { transform: translateX(-12em); }
}

@keyframes beetloader-stroll-body {
  0% { transform: none; }
  50% { transform: translateY(-1em); }
}

@keyframes beetloader-stroll-leaves {
  0% { transform: translateY(1em); }
  50% { transform: none; }
}

@keyframes beetloader-stroll-leg {
  0% { transform: none; }
  50% { transform: translateY(-1em); }
}
`;

/** The soil kicked up when the beet ducks, in the ground's color. */
const CRUMB_PATHS = spritePaths(
  ['..G..........G..', '...............G', 'G...............'],
  14,
  {G: 'currentColor'}
);

const SPARKLE_PATHS = spritePaths(
  [
    '..............S.',
    '.............SSS',
    '..............S.',
    '................',
    '................',
    '.S..............',
    'SSS.............',
    '.S..............',
  ],
  1,
  {S: '#d9a6c8'}
);

const SPROUT_1_PATHS = spritePaths(
  ['.......L........', '.......D........'],
  14
);

const SPROUT_2_PATHS = spritePaths(
  [
    '.....LL.LL......',
    '.....DLLLD......',
    '.......L........',
    '.......D........',
  ],
  12
);

const SPROUT_3_PATHS = spritePaths(
  [
    '.....LL.LL......',
    '....DLLDLLD.....',
    '......DLD.......',
    '.....KKKKK......',
    '....KBHBBBK.....',
    '....KBBBBBK.....',
    '.....KBBBK......',
    '......KBK.......',
    '.......K........',
  ],
  7
);

const LEFT_LEG_PATHS = spritePaths(
  ['.....K..........', '.....K..........', '....KK..........'],
  14
);

const RIGHT_LEG_PATHS = spritePaths(
  ['.........K......', '.........K......', '.........KK.....'],
  14
);

/** One layer of the sprite, on a grid shared by every layer. */
function Sprite(props: {paths: BeetPath[]; className?: string}) {
  return (
    <svg
      className={props.className}
      viewBox="0 0 16 18"
      shape-rendering="crispEdges"
      aria-hidden="true"
    >
      {props.paths.map((path) => (
        <path key={path.fill} d={path.d} fill={path.fill} />
      ))}
    </svg>
  );
}

function Hop() {
  return (
    <div className="beetloader beetloader--hop" aria-hidden="true">
      <div className="beetloader__ground beetloader__layer" />
      <div className="beetloader__beet beetloader__layer">
        <Sprite paths={BEET_BODY_PATHS} />
        <Sprite
          paths={BEET_LEAF_PATHS}
          className="beetloader__leaves beetloader__layer"
        />
      </div>
    </div>
  );
}

function Peekaboo() {
  return (
    <div className="beetloader beetloader--peekaboo" aria-hidden="true">
      <div className="beetloader__window">
        <div className="beetloader__beet beetloader__layer">
          <Sprite paths={BEET_LEAF_PATHS} />
          <Sprite paths={BEET_BODY_PATHS} />
        </div>
      </div>
      <div className="beetloader__ground" />
      <Sprite
        paths={CRUMB_PATHS}
        className="beetloader__crumbs beetloader__layer"
      />
    </div>
  );
}

function Sprout() {
  return (
    <div className="beetloader beetloader--sprout" aria-hidden="true">
      <div className="beetloader__ground" />
      <div className="beetloader__beet">
        <Sprite
          paths={SPROUT_1_PATHS}
          className="beetloader__sprout-1 beetloader__layer"
        />
        <Sprite
          paths={SPROUT_2_PATHS}
          className="beetloader__sprout-2 beetloader__layer"
        />
        <Sprite
          paths={SPROUT_3_PATHS}
          className="beetloader__sprout-3 beetloader__layer"
        />
        <div className="beetloader__group beetloader__sprout-grown beetloader__layer">
          <Sprite paths={BEET_LEAF_PATHS} />
          <Sprite paths={BEET_BODY_PATHS} />
        </div>
        <Sprite
          paths={SPARKLE_PATHS}
          className="beetloader__sparkles beetloader__layer"
        />
      </div>
    </div>
  );
}

function Stroll() {
  return (
    <div className="beetloader beetloader--stroll" aria-hidden="true">
      <div className="beetloader__window">
        <div className="beetloader__ground beetloader__layer" />
        <div className="beetloader__beet">
          <Sprite
            paths={LEFT_LEG_PATHS}
            className="beetloader__leg beetloader__layer"
          />
          <Sprite
            paths={RIGHT_LEG_PATHS}
            className="beetloader__leg beetloader__leg--right beetloader__layer"
          />
          <Sprite
            paths={BEET_BODY_PATHS}
            className="beetloader__body beetloader__layer"
          />
          <Sprite
            paths={BEET_LEAF_PATHS}
            className="beetloader__leaves beetloader__layer"
          />
        </div>
      </div>
    </div>
  );
}

/** Every beetloader that can be shown on the bootstrap screen. */
export const BEETLOADERS: Beetloader[] = [
  {id: 'hop', css: BASE_CSS + HOP_CSS, Component: Hop},
  {id: 'peekaboo', css: BASE_CSS + PEEKABOO_CSS, Component: Peekaboo},
  {id: 'sprout', css: BASE_CSS + SPROUT_CSS, Component: Sprout},
  {id: 'stroll', css: BASE_CSS + STROLL_CSS, Component: Stroll},
];

/** Picks a beetloader at random. */
export function pickBeetloader(random = Math.random): Beetloader {
  const index = Math.floor(random() * BEETLOADERS.length);
  return BEETLOADERS[index];
}
