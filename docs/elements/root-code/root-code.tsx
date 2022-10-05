import {useEffect, useRef} from 'preact/hooks';
import register from 'preact-custom-element';
import hljs from 'highlight.js/lib/common';

declare module 'preact' {
  namespace JSX {
    interface IntrinsicElements {
      'root-code': RootCode;
    }
  }
}

interface RootCode {
  code: string;
  language?: string;
}

function RootCode(props: RootCode) {
  const ref = useRef<HTMLPreElement>(null);
  const code: string = JSON.parse(props.code || '');
  let className: string;
  if (props.language) {
    className = `language-${props.language}`;
  }

  useEffect(() => {
    const el = ref.current!;
    const codeEl = el.firstElementChild!;
    codeEl.textContent = code;
    hljs.highlightElement(el);
  }, []);

  // eslint-disable-next-line prettier/prettier
  return <pre ref={ref}><code className={className} /></pre>
}

register(RootCode, 'root-code');
