import {marked} from 'marked';

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
  const rawHtml = props.inline ? marked.parseInline(code) : marked.parse(code);
  const html =
    typeof rawHtml === 'string'
      ? props.inline
        ? sanitizeInlineHtml(rawHtml)
        : sanitizeBlockHtml(rawHtml)
      : '';
  return (
    <div
      className={joinClassNames('Markdown', props.className)}
      dangerouslySetInnerHTML={{__html: html}}
    />
  );
}
