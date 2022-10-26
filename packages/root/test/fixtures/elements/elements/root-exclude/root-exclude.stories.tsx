// This file is meant to represent a storybook story, which should be excluded
// from the automatic element injection through a root.config.ts exclude
// pattern.

import {ComponentChildren} from 'preact';
import register from 'preact-custom-element';

declare module 'preact' {
  namespace JSX {
    interface IntrinsicElements {
      'root-label': ExcludeProps;
    }
  }
}

interface ExcludeProps {
  label?: string;
  children?: ComponentChildren;
}

function Exclude(props: ExcludeProps) {
  return <label>{props.children || props.label || ''}</label>;
}

register(Exclude, 'root-exclude');
