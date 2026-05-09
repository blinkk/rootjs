import './Surface.css';

import {ComponentChildren} from 'preact';
import {joinClassNames} from '../../utils/classes.js';

export interface SurfaceProps {
  id?: string;
  className?: string;
  children?: ComponentChildren;
}

export function Surface(props: SurfaceProps) {
  return (
    <div id={props.id} className={joinClassNames(props.className, 'Surface')}>
      {props.children}
    </div>
  );
}
