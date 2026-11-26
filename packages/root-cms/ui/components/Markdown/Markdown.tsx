import {marked} from 'marked';
import {useMemo} from 'preact/hooks';

import {
  sanitizeBlockHtml,
  sanitizeInlineHtml,
} from '../../../shared/sanitize.js';
import {joinClassNames} from '../../utils/classes.js';

interface MarkdownProps {
  className?: string;
  code: string;
  inline?: boolean;
}

export function Markdown(props: MarkdownProps) {
  const code = props.code || '';
  const inline = Boolean(props.inline);
  const html = useMemo(() => {
    const rawHtml = inline ? marked.parseInline(code) : marked.parse(code);
    if (typeof rawHtml !== 'string') {
      return '';
    }
    return inline ? sanitizeInlineHtml(rawHtml) : sanitizeBlockHtml(rawHtml);
  }, [code, inline]);
  return (
    <div
      className={joinClassNames('Markdown Prose', props.className)}
      dangerouslySetInnerHTML={{__html: html}}
    />
  );
}
