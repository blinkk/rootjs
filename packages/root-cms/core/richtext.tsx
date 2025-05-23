import {FunctionalComponent} from 'preact';

export type RichTextData = string;

export interface RichTextProps {
  data: RichTextData;
}

/** Simple renderer for the rich text data. */
export const RichText: FunctionalComponent<RichTextProps> = (props) => {
  const html = props.data || '';
  return <div dangerouslySetInnerHTML={{__html: html}} />;
};
