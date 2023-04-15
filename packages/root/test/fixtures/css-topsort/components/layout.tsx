import {ComponentChildren} from 'preact';

import {Body, Html} from '../../../../dist/core';
import './layout.scss';

export function Layout(props: {children: ComponentChildren}) {
  return (
    <Html>
      <Body>{props.children}</Body>
    </Html>
  );
}
