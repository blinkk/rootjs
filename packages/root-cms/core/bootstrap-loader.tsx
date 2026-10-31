import {
  BEET_BODY_PATHS,
  BEET_LEAF_PATHS,
  BeetPath,
  spritePaths,
} from '../shared/beet.js';

/**
 * The animated beets shown on the "bootstrap" screen. One is picked at random
 * for each page load, on the server, so only its css is inlined.
 *
 * The screen is up while the js bundle is parsed, so the animations must not
 * need the main thread: they're css-only and animate just `transform` and
 * `opacity`, with each moving part in its own layer. `step-end` timing holds
 * each frame, and because `1em` is one sprite pixel, every move lands on the
 * pixel grid. The base styles are each animation's still frame, which is what
 * `prefers-reduced-motion` shows.
 */
export interface BootstrapLoader {
  id: string;
  /** Styles for this loader, including the shared `BASE_CSS`. */
  css: string;
  Loader: () => JSX.Element;
}

/** Styles shared by every loader. */
const BASE_CSS = `
.bootstrap-beet {
  position: relative;
  flex: none;
  width: 24em;
  height: 24em;
  font-size: 8px;
  opacity: 0;
  animation: bootstrap-beet-fade-in 150ms ease 150ms forwards;
}

.bootstrap-beet > *,
.bootstrap-beet__beet > * {
  position: absolute;
}

.bootstrap-beet__beet {
  left: 4.5em;
  top: 4em;
  width: 16em;
  height: 18em;
}

.bootstrap-beet svg {
  position: absolute;
  left: 0;
  top: 0;
  width: 16em;
  height: 18em;
}

.bootstrap-beet__layer {
  will-change: transform, opacity;
}

.bootstrap-beet__group {
  inset: 0;
}

.bootstrap-beet__ground {
  height: 1em;
  background: var(--cms-color-border-strong, #cfcfcb);
}

@keyframes bootstrap-beet-fade-in {
  to {
    opacity: 1;
  }
}

@media (max-width: 480px) {
  .bootstrap-beet {
    font-size: 6px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .bootstrap-beet {
    opacity: 1;
  }

  .bootstrap-beet,
  .bootstrap-beet * {
    animation: none !important;
  }
}
`;

const HOP_CSS = `
.bootstrap-beet--hop .bootstrap-beet__beet {
  top: 5em;
  animation: bootstrap-beet-hop 1s step-end infinite;
}

.bootstrap-beet--hop .bootstrap-beet__leaves {
  animation: bootstrap-beet-hop-leaves 1s step-end infinite;
}

.bootstrap-beet--hop .bootstrap-beet__ground {
  left: 7em;
  top: 21em;
  width: 10em;
  animation: bootstrap-beet-hop-shadow 1s step-end infinite;
}

@keyframes bootstrap-beet-hop {
  0%, 10% { transform: none; }
  20% { transform: translateY(-2em); }
  30% { transform: translateY(-4em); }
  40%, 50% { transform: translateY(-5em); }
  60% { transform: translateY(-4em); }
  70% { transform: translateY(-2em); }
  80% { transform: none; }
}

@keyframes bootstrap-beet-hop-leaves {
  0% { transform: none; }
  10%, 20%, 30% { transform: translateY(1em); }
  40%, 50% { transform: none; }
  60%, 70% { transform: translateY(-1em); }
  80% { transform: translateY(2em); }
  90% { transform: translateY(1em); }
}

@keyframes bootstrap-beet-hop-shadow {
  0%, 10%, 80% { transform: none; }
  20%, 70% { transform: scaleX(0.8); }
  30%, 60% { transform: scaleX(0.6); }
  40%, 50% { transform: scaleX(0.4); }
}
`;

const PEEKABOO_CSS = `
.bootstrap-beet--peekaboo .bootstrap-beet__window {
  left: 0;
  top: 0;
  width: 24em;
  height: 20em;
  overflow: hidden;
}

.bootstrap-beet--peekaboo .bootstrap-beet__beet {
  position: absolute;
  animation: bootstrap-beet-peekaboo 3s step-end infinite;
}

.bootstrap-beet--peekaboo .bootstrap-beet__ground {
  left: 2em;
  top: 20em;
  width: 20em;
}

.bootstrap-beet--peekaboo .bootstrap-beet__crumbs {
  left: 4.5em;
  top: 4em;
  color: var(--cms-color-border-strong, #cfcfcb);
  opacity: 0;
  animation: bootstrap-beet-peekaboo-crumbs 3s step-end infinite;
}

@keyframes bootstrap-beet-peekaboo {
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

@keyframes bootstrap-beet-peekaboo-crumbs {
  0%, 90% { opacity: 0; transform: none; }
  85% { opacity: 1; transform: none; }
  88% { opacity: 1; transform: translateY(-1em); }
}
`;

const SPROUT_CSS = `
.bootstrap-beet--sprout .bootstrap-beet__ground {
  left: 4em;
  top: 20em;
  width: 16em;
}

.bootstrap-beet__sprout-1,
.bootstrap-beet__sprout-2,
.bootstrap-beet__sprout-3,
.bootstrap-beet__sparkles {
  opacity: 0;
}

.bootstrap-beet__sprout-1 {
  animation: bootstrap-beet-sprout-1 3s step-end infinite;
}

.bootstrap-beet__sprout-2 {
  animation: bootstrap-beet-sprout-2 3s step-end infinite;
}

.bootstrap-beet__sprout-3 {
  animation: bootstrap-beet-sprout-3 3s step-end infinite;
}

.bootstrap-beet__sprout-grown {
  animation: bootstrap-beet-sprout-grown 3s step-end infinite;
}

.bootstrap-beet__sparkles {
  animation: bootstrap-beet-sprout-sparkles 3s step-end infinite;
}

@keyframes bootstrap-beet-sprout-1 {
  0%, 24% { opacity: 0; }
  6% { opacity: 1; }
}

@keyframes bootstrap-beet-sprout-2 {
  0%, 40% { opacity: 0; }
  24% { opacity: 1; }
}

@keyframes bootstrap-beet-sprout-3 {
  0%, 56% { opacity: 0; }
  40% { opacity: 1; }
}

@keyframes bootstrap-beet-sprout-grown {
  0%, 94% { opacity: 0; transform: none; }
  56% { opacity: 1; transform: translateY(-1em); }
  60% { opacity: 1; transform: none; }
}

@keyframes bootstrap-beet-sprout-sparkles {
  0%, 70%, 82% { opacity: 0; }
  62%, 76% { opacity: 1; }
}
`;

const STROLL_CSS = `
.bootstrap-beet--stroll .bootstrap-beet__window {
  left: 0;
  top: 0;
  width: 24em;
  height: 24em;
  overflow: hidden;
}

.bootstrap-beet--stroll .bootstrap-beet__beet {
  position: absolute;
  top: 3em;
}

.bootstrap-beet--stroll .bootstrap-beet__ground {
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
  animation: bootstrap-beet-stroll-ground 0.96s steps(12, end) infinite;
}

.bootstrap-beet--stroll .bootstrap-beet__body {
  animation: bootstrap-beet-stroll-body 0.32s step-end infinite;
}

.bootstrap-beet--stroll .bootstrap-beet__leaves {
  animation: bootstrap-beet-stroll-leaves 0.32s step-end infinite;
}

.bootstrap-beet__leg {
  animation: bootstrap-beet-stroll-leg 0.64s step-end infinite;
}

.bootstrap-beet__leg--right {
  animation-delay: -0.32s;
}

@keyframes bootstrap-beet-stroll-ground {
  to { transform: translateX(-12em); }
}

@keyframes bootstrap-beet-stroll-body {
  0% { transform: none; }
  50% { transform: translateY(-1em); }
}

@keyframes bootstrap-beet-stroll-leaves {
  0% { transform: translateY(1em); }
  50% { transform: none; }
}

@keyframes bootstrap-beet-stroll-leg {
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
    <div className="bootstrap-beet bootstrap-beet--hop" aria-hidden="true">
      <div className="bootstrap-beet__ground bootstrap-beet__layer" />
      <div className="bootstrap-beet__beet bootstrap-beet__layer">
        <Sprite paths={BEET_BODY_PATHS} />
        <Sprite
          paths={BEET_LEAF_PATHS}
          className="bootstrap-beet__leaves bootstrap-beet__layer"
        />
      </div>
    </div>
  );
}

function Peekaboo() {
  return (
    <div className="bootstrap-beet bootstrap-beet--peekaboo" aria-hidden="true">
      <div className="bootstrap-beet__window">
        <div className="bootstrap-beet__beet bootstrap-beet__layer">
          <Sprite paths={BEET_LEAF_PATHS} />
          <Sprite paths={BEET_BODY_PATHS} />
        </div>
      </div>
      <div className="bootstrap-beet__ground" />
      <Sprite
        paths={CRUMB_PATHS}
        className="bootstrap-beet__crumbs bootstrap-beet__layer"
      />
    </div>
  );
}

function Sprout() {
  return (
    <div className="bootstrap-beet bootstrap-beet--sprout" aria-hidden="true">
      <div className="bootstrap-beet__ground" />
      <div className="bootstrap-beet__beet">
        <Sprite
          paths={SPROUT_1_PATHS}
          className="bootstrap-beet__sprout-1 bootstrap-beet__layer"
        />
        <Sprite
          paths={SPROUT_2_PATHS}
          className="bootstrap-beet__sprout-2 bootstrap-beet__layer"
        />
        <Sprite
          paths={SPROUT_3_PATHS}
          className="bootstrap-beet__sprout-3 bootstrap-beet__layer"
        />
        <div className="bootstrap-beet__group bootstrap-beet__sprout-grown bootstrap-beet__layer">
          <Sprite paths={BEET_LEAF_PATHS} />
          <Sprite paths={BEET_BODY_PATHS} />
        </div>
        <Sprite
          paths={SPARKLE_PATHS}
          className="bootstrap-beet__sparkles bootstrap-beet__layer"
        />
      </div>
    </div>
  );
}

function Stroll() {
  return (
    <div className="bootstrap-beet bootstrap-beet--stroll" aria-hidden="true">
      <div className="bootstrap-beet__window">
        <div className="bootstrap-beet__ground bootstrap-beet__layer" />
        <div className="bootstrap-beet__beet">
          <Sprite
            paths={LEFT_LEG_PATHS}
            className="bootstrap-beet__leg bootstrap-beet__layer"
          />
          <Sprite
            paths={RIGHT_LEG_PATHS}
            className="bootstrap-beet__leg bootstrap-beet__leg--right bootstrap-beet__layer"
          />
          <Sprite
            paths={BEET_BODY_PATHS}
            className="bootstrap-beet__body bootstrap-beet__layer"
          />
          <Sprite
            paths={BEET_LEAF_PATHS}
            className="bootstrap-beet__leaves bootstrap-beet__layer"
          />
        </div>
      </div>
    </div>
  );
}

/** Every loader that can be shown on the bootstrap screen. */
export const BOOTSTRAP_LOADERS: BootstrapLoader[] = [
  {id: 'hop', css: BASE_CSS + HOP_CSS, Loader: Hop},
  {id: 'peekaboo', css: BASE_CSS + PEEKABOO_CSS, Loader: Peekaboo},
  {id: 'sprout', css: BASE_CSS + SPROUT_CSS, Loader: Sprout},
  {id: 'stroll', css: BASE_CSS + STROLL_CSS, Loader: Stroll},
];

/** Picks a loader at random. */
export function pickBootstrapLoader(random = Math.random): BootstrapLoader {
  const index = Math.floor(random() * BOOTSTRAP_LOADERS.length);
  return BOOTSTRAP_LOADERS[index];
}
