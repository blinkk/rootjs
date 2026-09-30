import './RootJsLogo.css';
import {BEET_CROP, BEET_PATHS} from '../../../shared/beet.js';

/** The Root.js logo lockup: the pixel-art beet followed by "Root.js". */
export function RootJsLogo() {
  return (
    <span className="RootJsLogo" role="img" aria-label="Root.js">
      <svg
        className="RootJsLogo__beet"
        viewBox={`${BEET_CROP.x} 0 ${BEET_CROP.width} 16`}
        shape-rendering="crispEdges"
        aria-hidden="true"
      >
        {BEET_PATHS.map((path) => (
          <path key={path.fill} d={path.d} fill={path.fill} />
        ))}
      </svg>
      <span className="RootJsLogo__text" aria-hidden="true">
        Root.js
      </span>
    </span>
  );
}
