import {StringParamsProvider, useTranslations} from '@blinkk/root';
import {Component, FunctionalComponent, createContext} from 'preact';
import {useContext} from 'preact/hooks';
import {renderToString} from 'preact-render-to-string';

export interface RichTextBlock {
  type: string;
  data?: any;
}

export interface RichTextData {
  [key: string]: any;
  blocks: RichTextBlock[];
}

export type RichTextComponent = FunctionalComponent<any>;
export type RichTextBlockComponent = RichTextComponent;
export type RichTextInlineComponent = RichTextComponent;

export type RichTextComponentMap = Record<string, RichTextComponent>;

export interface RichTextContextProps {
  /**
   * Rich text components override for both inline and block level components.
   */
  components?: RichTextComponentMap;
  /**
   * Translator function override.
   */
  t?: (msg: string, params?: Record<string, string | number>) => string;
}

export const RichTextContext = createContext<RichTextContextProps>({});

export function useRichTextContext(): RichTextContextProps {
  return useContext(RichTextContext);
}

const RichTextComponentMapContext = createContext<RichTextComponentMap>({});

function useRichTextContextComponentMap(): RichTextComponentMap {
  return useContext(RichTextComponentMapContext);
}

function useRichTextTranslations() {
  const ctx = useRichTextContext();
  if (ctx.t) {
    return ctx.t;
  }
  return useTranslations();
}

export interface RichTextProps {
  data: RichTextData | undefined;
  components?: Record<string, RichTextBlockComponent>;
  /** @deprecated */
  translate?: boolean;
}

/** Renders data from the "richtext" field. */
export function RichText(props: RichTextProps) {
  const blocks = props.data?.blocks || [];
  if (blocks.length === 0) {
    return null;
  }

  const richTextContext = useRichTextContext();
  const componentMap: Record<string, RichTextBlockComponent> = {
    heading: RichText.HeadingBlock,
    html: RichText.HtmlBlock,
    image: RichText.ImageBlock,
    orderedList: RichText.ListBlock,
    paragraph: RichText.ParagraphBlock,
    table: RichText.TableBlock,
    unorderedList: RichText.ListBlock,
    ...richTextContext.components,
    ...props.components,
  };
  return (
    <RichTextComponentMapContext.Provider value={componentMap}>
      {blocks
        .map((block) => {
          return <RichText.Block {...block} />;
        })
        .filter((value) => !!value)}
    </RichTextComponentMapContext.Provider>
  );
}

RichText.Block = (props: RichTextBlock) => {
  const block = props;
  const blockType = block?.type;
  if (!blockType) {
    return null;
  }
  const componentMap = useRichTextContextComponentMap();
  const BlockComponent = componentMap[blockType];
  if (!BlockComponent) {
    console.warn(`[RichText] ignoring unknown richtext type: "${blockType}"`);
    return null;
  }
  return (
    <InlineComponentRenderer
      block={block}
      componentMap={componentMap}
      BlockComponent={BlockComponent}
    />
  );
};

interface InlineComponentRendererProps {
  block: RichTextBlock;
  componentMap: RichTextComponentMap;
  BlockComponent: RichTextBlockComponent;
}

/**
 * Class component used to capture the parent's full Preact context tree (via
 * `this.context`) so that inline components rendered through `renderToString`
 * have access to the same providers (e.g. I18nContext for `useTranslations`,
 * any custom user contexts, etc.) as the surrounding render.
 */
class InlineComponentRenderer extends Component<InlineComponentRendererProps> {
  render() {
    const {block, componentMap, BlockComponent} = this.props;
    const stringParams = collectInlineComponentParams(
      block,
      componentMap,
      this.context
    );
    if (stringParams) {
      return (
        <StringParamsProvider value={stringParams}>
          <BlockComponent {...block} />
        </StringParamsProvider>
      );
    }
    return <BlockComponent {...block} />;
  }
}

export interface RichTextParagraphBlockProps {
  type: 'paragraph';
  data?: {
    text?: string;
    components?: Record<string, any>;
  };
}

RichText.ParagraphBlock = (props: RichTextParagraphBlockProps) => {
  if (!props.data?.text) {
    return null;
  }
  const t = useRichTextTranslations();
  const html = t(props.data.text);
  return <p dangerouslySetInnerHTML={{__html: html}} />;
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
  const t = useRichTextTranslations();
  const level = props.data.level || 2;
  const Component = `h${level}` as HeadingComponent;
  const html = t(props.data.text);
  return <Component dangerouslySetInnerHTML={{__html: html}} />;
};

interface ListItem {
  content?: string;
  items?: ListItem[];
  components?: Record<string, any>;
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
                <RichText.Block
                  type="paragraph"
                  data={{text: item.content, components: item.components}}
                />
              )}
              {item.items && item.items.length > 0 && (
                <RichText.Block
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
    /** The caption entered into the CMS Image field. */
    caption?: string;
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
  const t = useRichTextTranslations();
  const html = t(props.data?.html || '');
  if (!html) {
    return null;
  }
  return <div dangerouslySetInnerHTML={{__html: html}} />;
};

export interface RichTextTableBlockProps {
  type: 'table';
  data?: {
    rows?: Array<{
      cells: Array<{
        blocks: RichTextBlock[];
        type: 'header' | 'data';
      }>;
    }>;
  };
}

RichText.TableBlock = (props: RichTextTableBlockProps) => {
  const rows = props.data?.rows || [];
  const richTextContext = useRichTextContext();
  if (rows.length === 0) {
    return null;
  }
  return (
    <table>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex}>
            {row.cells.map((cell, cellIndex) => {
              const Cell = cell.type === 'header' ? 'th' : 'td';
              return (
                <Cell key={cellIndex}>
                  <RichText
                    data={{blocks: cell.blocks, time: 0, version: ''}}
                    components={richTextContext.components}
                  />
                </Cell>
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

/** Returns whether the rich text value is truthy. */
export function testContent(data: RichTextData) {
  return data?.blocks?.length > 0;
}

/**
 * Collects inline component data from all blocks and renders them into a string
 * params map. Keys use the `{ComponentType:componentId}` format that matches
 * the markers in the rich text content.
 *
 * `renderContext` is the raw Preact context object captured from the calling
 * component's render tree, so the inline components can read context providers
 * (e.g. `useTranslations`, custom user contexts) just like any other component.
 */
function collectInlineComponentParams(
  block: RichTextBlock,
  componentMap: RichTextComponentMap,
  renderContext?: any
): Record<string, string> | null {
  const components: Record<string, any> = block?.data?.components || {};
  if (Object.keys(components).length === 0) {
    return null;
  }

  const params: Record<string, string> = {};
  for (const [componentId, component] of Object.entries(components)) {
    const Component = componentMap[component.type];
    if (Component) {
      const key = `${component.type}:${componentId}`;
      params[key] = renderToString(
        <Component {...component.data} />,
        renderContext
      );
    } else {
      console.warn(
        `[RichText] could not find inline component for type: "${component.type}"`
      );
    }
  }

  return params;
}
