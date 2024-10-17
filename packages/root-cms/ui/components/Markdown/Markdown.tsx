import {marked} from 'marked';
import {joinClassNames} from '@/utils/classes.js';

interface MarkdownProps {
  className?: string;
  code: string;
  inline?: boolean;
}

export function Markdown(props: MarkdownProps) {
  const code = props.code || '';
  // TODO(stevenle): sanitize so it only accepts basic formatting and links.
  const html = props.inline ? marked.parseInline(code) : marked.parse(code);
  return (
    <div
      className={joinClassNames('Markdown', props.className)}
      dangerouslySetInnerHTML={{__html: html as string}}
    />
  );
}
