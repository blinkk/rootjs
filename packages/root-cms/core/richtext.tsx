import {useTranslations} from '@blinkk/root';
import {FunctionalComponent, createContext} from 'preact';
import {useContext} from 'preact/hooks';

export interface RichTextBlock {
  type: string;
  data?: any;
}

export interface RichTextData {
  [key: string]: any;
  blocks: any[];
}

export type RichTextBlockComponent = FunctionalComponent<any>;

export interface RichTextContextProps {
  components?: Record<string, RichTextBlockComponent>;
}

export const RichTextContext = createContext<RichTextContextProps>({});

export function useRichTextContext(): RichTextContextProps {
  return useContext(RichTextContext);
}

export interface RichTextProps {
  data: RichTextData;
  components?: Record<string, RichTextBlockComponent>;
}

/** Renders data from the "richtext" field. */
export function RichText(props: RichTextProps) {
  const richTextContext = useRichTextContext();
  const components: Record<string, RichTextBlockComponent> = {
    delimiter: RichText.DelimiterBlock,
    heading: RichText.HeadingBlock,
    html: RichText.HtmlBlock,
    image: RichText.ImageBlock,
    orderedList: RichText.ListBlock,
    paragraph: RichText.ParagraphBlock,
    quote: RichText.QuoteBlock,
    table: RichText.TableBlock,
    unorderedList: RichText.ListBlock,
    ...richTextContext.components,
    ...props.components,
  };
  const blocks = (props.data?.blocks || []).filter((block) => {
    const blockType = block?.type;
    if (!blockType) {
      return false;
    }
    if (!(blockType in components)) {
      console.warn(`ignoring unknown richtext type: "${blockType}"`);
      return false;
    }
    return true;
  });
  return (
    <>
      {blocks.map((block) => {
        const Block = components[block.type];
        return <Block {...block} />;
      })}
    </>
  );
}

export interface RichTextParagraphBlockProps {
  type: 'paragraph';
  data?: {
    text?: string;
  };
}

RichText.ParagraphBlock = (props: RichTextParagraphBlockProps) => {
  if (!props.data?.text) {
    return null;
  }
  const t = useTranslations();
  return <p dangerouslySetInnerHTML={{__html: t(props.data.text)}} />;
};

export interface RichTextDelimiterBlockProps {
  type: 'delimiter';
  data?: {};
}

RichText.DelimiterBlock = () => {
  return <hr />;
};

export interface RichTextHeadingBlockProps {
  type: 'heading';
  data?: {
    level?: number;
    text?: string;
  };
}

type HeadingComponent = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

RichText.HeadingBlock = (props: RichTextHeadingBlockProps) => {
  if (!props.data?.text) {
    return null;
  }
  const t = useTranslations();
  const level = props.data.level || 2;
  const Component = `h${level}` as HeadingComponent;
  return <Component dangerouslySetInnerHTML={{__html: t(props.data.text)}} />;
};

export interface RichTextQuoteBlockProps {
  type: 'quote';
  data?: {
    text?: string;
  };
}

RichText.QuoteBlock = (props: RichTextQuoteBlockProps) => {
  if (!props.data?.text) {
    return null;
  }
  const t = useTranslations();
  return <blockquote dangerouslySetInnerHTML={{__html: t(props.data.text)}} />;
};

interface ListItem {
  content?: string;
  items?: ListItem[];
}

export interface RichTextListBlockProps {
  type: 'orderedList' | 'unorderedList';
  data?: {
    style?: 'ordered' | 'unordered';
    items?: ListItem[];
  };
}

RichText.ListBlock = (props: RichTextListBlockProps) => {
  if (!props.data?.items?.length) {
    return null;
  }

  let style = props.data?.style;
  if (!style) {
    style = props.type === 'orderedList' ? 'ordered' : 'unordered';
  }
  const Component = style === 'ordered' ? 'ol' : 'ul';
  const items = props.data.items;
  return (
    <Component>
      {items.map((item) => {
        if (item.content || item.items?.length) {
          return (
            <li>
              {item.content && (
                <RichText.ParagraphBlock
                  type="paragraph"
                  data={{text: item.content}}
                />
              )}
              {item.items && item.items.length > 0 && (
                <RichText.ListBlock
                  type={props.type}
                  data={{style, items: item.items}}
                />
              )}
            </li>
          );
        }
        return null;
      })}
    </Component>
  );
};

export interface RichTextImageBlockProps {
  type: 'image';
  data?: {
    file?: {
      url: string;
      width: string | number;
      height: string | number;
      alt: string;
    };
  };
}

RichText.ImageBlock = (props: RichTextImageBlockProps) => {
  const imageUrl = props.data?.file?.url;
  if (!imageUrl) {
    return null;
  }
  const width = toNumber(props.data?.file?.width);
  const height = toNumber(props.data?.file?.height);
  const alt = props.data?.file?.alt || '';
  return <img src={imageUrl} width={width} height={height} alt={alt} />;
};

export interface RichTextHtmlBlockProps {
  type: 'html';
  data?: {
    html?: string;
  };
}

RichText.HtmlBlock = (props: RichTextHtmlBlockProps) => {
  const html = props.data?.html || '';
  if (!html) {
    return null;
  }
  return <div dangerouslySetInnerHTML={{__html: html}} />;
};

export interface RichTextTableBlockProps {
  type: 'table';
  data?: {
    rows?: number;
    cols?: number;
    cells?: string[];
    headers?: number[]; // Header states: 0=normal, 1=row, 2=column, 3=both
  };
}

RichText.TableBlock = (props: RichTextTableBlockProps) => {
  const numRows = props.data?.rows || 0;
  const numCols = props.data?.cols || 0;
  const cells = props.data?.cells || [];
  const headers = props.data?.headers || [];

  if (numRows === 0 || numCols === 0) {
    return null;
  }
  const t = useTranslations();

  return (
    <table>
      <tbody>
        {Array.from({length: numRows}).map((_, rowIndex) => (
          <tr key={rowIndex}>
            {Array.from({length: numCols}).map((_, colIndex) => {
              const cellIndex = rowIndex * numCols + colIndex;
              const cellText = cells[cellIndex] || '';
              const headerState = headers[cellIndex] || 0;
              // headerState: 0=normal, 1=row header, 2=column header, 3=both
              const isHeader = headerState > 0;
              const CellTag = isHeader ? 'th' : 'td';
              return (
                <CellTag
                  key={colIndex}
                  dangerouslySetInnerHTML={{__html: t(cellText)}}
                />
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

function toNumber(input?: string | number): number {
  if (input === undefined) {
    return 0;
  }
  if (typeof input === 'number') {
    return input;
  }
  const parsedNumber = parseFloat(input);
  if (isNaN(parsedNumber)) {
    return 0;
  }
  return parsedNumber;
}
