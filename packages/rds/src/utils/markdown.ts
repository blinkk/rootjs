import {marked} from 'marked';

export interface MarkdownOptions {
  inline?: boolean;
  markedOptions?: marked.MarkedOptions;
}

export function markdownToHtml(code: string, options?: MarkdownOptions) {
  const markdownOptions: marked.MarkedOptions = {
    gfm: true,
    breaks: true,
    smartypants: true,
    ...options?.markedOptions,
  };
  const html = options?.inline
    ? marked.parseInline(code, markdownOptions)
    : marked.parse(code, markdownOptions);
  return html;
}
