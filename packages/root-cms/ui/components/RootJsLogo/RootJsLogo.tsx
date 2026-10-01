import './RootJsLogo.css';
import {BEET_CROP, BEET_PATHS} from '../../../shared/beet.js';

/** The Root.js logo lockup: the pixel-art beet followed by "Root.js". */
export function RootJsLogo() {
  return (
    <span className="RootJsLogo" role="img" aria-label="Root.js">
      <RootJsBeet className="RootJsLogo__beet" />
      <span className="RootJsLogo__text" aria-hidden="true">
        Root.js
      </span>
    </span>
  );
}

/** The pixel-art beet from the Root.js logo, without the "Root.js" text. */
export function RootJsBeet(props: {className?: string}) {
  return (
    <svg
      className={props.className}
      viewBox={`${BEET_CROP.x} 0 ${BEET_CROP.width} 16`}
      shape-rendering="crispEdges"
      aria-hidden="true"
    >
      {BEET_PATHS.map((path) => (
        <path key={path.fill} d={path.d} fill={path.fill} />
      ))}
    </svg>
  );
}
