import {ComponentChildren} from 'preact';
import register from 'preact-custom-element';

declare module 'preact' {
  namespace JSX {
    interface IntrinsicElements {
      'root-label': LabelProps;
    }
  }
}

interface LabelProps {
  label?: string;
  children?: ComponentChildren;
}

function Label(props: LabelProps) {
  return <label>{props.children || props.label || ''}</label>;
}

register(Label, 'root-label');
