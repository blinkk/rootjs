/**
 * @module types
 *
 * JSX namespace and HTML attribute type definitions for the Root.js SSR
 * JSX runtime. These types allow TypeScript to type-check JSX expressions
 * when `jsxImportSource` points to this module.
 */

import type {VNode, ComponentChildren} from './jsx-runtime.js';

// =============================================================================
// HTML Attribute Interfaces
// =============================================================================

export interface DOMAttributes {
  children?: ComponentChildren;
  dangerouslySetInnerHTML?: {__html: string};

  // Clipboard Events
  onCopy?: EventHandler;
  onCut?: EventHandler;
  onPaste?: EventHandler;

  // Keyboard Events
  onKeyDown?: EventHandler;
  onKeyPress?: EventHandler;
  onKeyUp?: EventHandler;

  // Focus Events
  onFocus?: EventHandler;
  onBlur?: EventHandler;

  // Form Events
  onChange?: EventHandler;
  onInput?: EventHandler;
  onSubmit?: EventHandler;
  onReset?: EventHandler;

  // Mouse Events
  onClick?: EventHandler;
  onContextMenu?: EventHandler;
  onDoubleClick?: EventHandler;
  onDrag?: EventHandler;
  onDragEnd?: EventHandler;
  onDragEnter?: EventHandler;
  onDragExit?: EventHandler;
  onDragLeave?: EventHandler;
  onDragOver?: EventHandler;
  onDragStart?: EventHandler;
  onDrop?: EventHandler;
  onMouseDown?: EventHandler;
  onMouseEnter?: EventHandler;
  onMouseLeave?: EventHandler;
  onMouseMove?: EventHandler;
  onMouseOut?: EventHandler;
  onMouseOver?: EventHandler;
  onMouseUp?: EventHandler;

  // Touch Events
  onTouchCancel?: EventHandler;
  onTouchEnd?: EventHandler;
  onTouchMove?: EventHandler;
  onTouchStart?: EventHandler;

  // Scroll Events
  onScroll?: EventHandler;

  // Animation Events
  onAnimationStart?: EventHandler;
  onAnimationEnd?: EventHandler;
  onAnimationIteration?: EventHandler;

  // Transition Events
  onTransitionEnd?: EventHandler;

  // Media Events
  onLoad?: EventHandler;
  onError?: EventHandler;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventHandler = (...args: any[]) => void;

export interface AriaAttributes {
  role?: string;
  'aria-activedescendant'?: string;
  'aria-atomic'?: boolean | 'false' | 'true';
  'aria-autocomplete'?: 'none' | 'inline' | 'list' | 'both';
  'aria-busy'?: boolean | 'false' | 'true';
  'aria-checked'?: boolean | 'false' | 'mixed' | 'true';
  'aria-colcount'?: number;
  'aria-colindex'?: number;
  'aria-colspan'?: number;
  'aria-controls'?: string;
  'aria-current'?:
    | boolean
    | 'false'
    | 'true'
    | 'page'
    | 'step'
    | 'location'
    | 'date'
    | 'time';
  'aria-describedby'?: string;
  'aria-details'?: string;
  'aria-disabled'?: boolean | 'false' | 'true';
  'aria-dropeffect'?: 'none' | 'copy' | 'execute' | 'link' | 'move' | 'popup';
  'aria-errormessage'?: string;
  'aria-expanded'?: boolean | 'false' | 'true';
  'aria-flowto'?: string;
  'aria-grabbed'?: boolean | 'false' | 'true';
  'aria-haspopup'?:
    | boolean
    | 'false'
    | 'true'
    | 'menu'
    | 'listbox'
    | 'tree'
    | 'grid'
    | 'dialog';
  'aria-hidden'?: boolean | 'false' | 'true';
  'aria-invalid'?: boolean | 'false' | 'true' | 'grammar' | 'spelling';
  'aria-keyshortcuts'?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-level'?: number;
  'aria-live'?: 'off' | 'assertive' | 'polite';
  'aria-modal'?: boolean | 'false' | 'true';
  'aria-multiline'?: boolean | 'false' | 'true';
  'aria-multiselectable'?: boolean | 'false' | 'true';
  'aria-orientation'?: 'horizontal' | 'vertical';
  'aria-owns'?: string;
  'aria-placeholder'?: string;
  'aria-posinset'?: number;
  'aria-pressed'?: boolean | 'false' | 'mixed' | 'true';
  'aria-readonly'?: boolean | 'false' | 'true';
  'aria-relevant'?: string;
  'aria-required'?: boolean | 'false' | 'true';
  'aria-roledescription'?: string;
  'aria-rowcount'?: number;
  'aria-rowindex'?: number;
  'aria-rowspan'?: number;
  'aria-selected'?: boolean | 'false' | 'true';
  'aria-setsize'?: number;
  'aria-sort'?: 'none' | 'ascending' | 'descending' | 'other';
  'aria-valuemax'?: number;
  'aria-valuemin'?: number;
  'aria-valuenow'?: number;
  'aria-valuetext'?: string;
}

/**
 * Common HTML attributes shared by all HTML elements.
 * The type parameter `T` is retained for API compatibility with Preact's
 * `HTMLAttributes<HTMLElement>` pattern, but is unused at runtime since
 * this is an SSR-only renderer.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface HTMLAttributes<T = HTMLElement>
  extends DOMAttributes,
    AriaAttributes {
  // Standard HTML Attributes
  accept?: string;
  acceptCharset?: string;
  accessKey?: string;
  action?: string;
  allow?: string;
  allowFullScreen?: boolean;
  allowTransparency?: boolean;
  alt?: string;
  as?: string;
  async?: boolean;
  autoComplete?: string;
  autoCorrect?: string;
  autoFocus?: boolean;
  autoPlay?: boolean;
  capture?: boolean | string;
  cellPadding?: number | string;
  cellSpacing?: number | string;
  charSet?: string;
  challenge?: string;
  checked?: boolean;
  cite?: string;
  class?: string;
  className?: string;
  cols?: number;
  colSpan?: number;
  content?: string;
  contentEditable?: boolean | 'true' | 'false' | 'inherit';
  contextMenu?: string;
  controls?: boolean;
  controlsList?: string;
  coords?: string;
  crossOrigin?: string;
  data?: string;
  dateTime?: string;
  default?: boolean;
  defer?: boolean;
  dir?: 'auto' | 'ltr' | 'rtl';
  disabled?: boolean;
  disableRemotePlayback?: boolean;
  download?: string | boolean;
  decoding?: 'sync' | 'async' | 'auto';
  draggable?: boolean;
  encType?: string;
  enterKeyHint?: string;
  for?: string;
  form?: string;
  formAction?: string;
  formEncType?: string;
  formMethod?: string;
  formNoValidate?: boolean;
  formTarget?: string;
  frameBorder?: number | string;
  headers?: string;
  height?: number | string;
  hidden?: boolean | string;
  high?: number;
  href?: string;
  hrefLang?: string;
  htmlFor?: string;
  httpEquiv?: string;
  icon?: string;
  id?: string;
  importance?: 'auto' | 'high' | 'low';
  inputMode?: string;
  integrity?: string;
  is?: string;
  key?: string | number;
  kind?: string;
  label?: string;
  lang?: string;
  list?: string;
  loading?: 'eager' | 'lazy';
  loop?: boolean;
  low?: number;
  manifest?: string;
  marginHeight?: number;
  marginWidth?: number;
  max?: number | string;
  maxLength?: number;
  media?: string;
  mediaGroup?: string;
  method?: string;
  min?: number | string;
  minLength?: number;
  multiple?: boolean;
  muted?: boolean;
  name?: string;
  noModule?: boolean;
  nonce?: string;
  noValidate?: boolean;
  open?: boolean;
  optimum?: number;
  part?: string;
  pattern?: string;
  placeholder?: string;
  playsInline?: boolean;
  poster?: string;
  preload?: string;
  radioGroup?: string;
  readOnly?: boolean;
  referrerPolicy?: string;
  rel?: string;
  required?: boolean;
  reversed?: boolean;
  rows?: number;
  rowSpan?: number;
  sandbox?: string;
  scope?: string;
  scoped?: boolean;
  scrolling?: string;
  seamless?: boolean;
  selected?: boolean;
  shape?: string;
  size?: number;
  sizes?: string;
  slot?: string;
  span?: number;
  spellcheck?: boolean;
  src?: string;
  srcDoc?: string;
  srcLang?: string;
  srcSet?: string;
  start?: number;
  step?: number | string;
  style?: string | Record<string, string | number>;
  summary?: string;
  tabIndex?: number;
  target?: string;
  title?: string;
  translate?: 'yes' | 'no';
  type?: string;
  useMap?: string;
  value?: string | string[] | number;
  volume?: number;
  width?: number | string;
  wmode?: string;
  wrap?: string;

  // Non-standard / data attributes
  autocapitalize?: string;
  disablePictureInPicture?: boolean;
  results?: number;
  security?: string;
  unselectable?: 'on' | 'off';

  // Allow data-* and custom attributes
  [key: `data-${string}`]: string | number | boolean | undefined;
}

/**
 * SVG-specific attributes.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface SVGAttributes<T = SVGElement> extends HTMLAttributes<T> {
  accentHeight?: number | string;
  accumulate?: 'none' | 'sum';
  additive?: 'replace' | 'sum';
  alignmentBaseline?: string;
  allowReorder?: 'no' | 'yes';
  clipPath?: string;
  clipPathUnits?: string;
  clipRule?: string;
  colorInterpolation?: string;
  colorInterpolationFilters?: string;
  cursor?: string;
  cx?: number | string;
  cy?: number | string;
  d?: string;
  dominantBaseline?: string;
  dx?: number | string;
  dy?: number | string;
  fill?: string;
  fillOpacity?: number | string;
  fillRule?: 'nonzero' | 'evenodd' | 'inherit';
  filter?: string;
  floodColor?: string;
  floodOpacity?: number | string;
  fontFamily?: string;
  fontSize?: number | string;
  fontStyle?: string;
  fontVariant?: string;
  fontWeight?: number | string;
  fx?: number | string;
  fy?: number | string;
  gradientTransform?: string;
  gradientUnits?: string;
  imageRendering?: string;
  in?: string;
  in2?: string;
  k1?: number;
  k2?: number;
  k3?: number;
  k4?: number;
  letterSpacing?: number | string;
  lightingColor?: string;
  markerEnd?: string;
  markerHeight?: number | string;
  markerMid?: string;
  markerStart?: string;
  markerUnits?: string;
  markerWidth?: number | string;
  mask?: string;
  offset?: number | string;
  opacity?: number | string;
  operator?: string;
  order?: number | string;
  overflow?: string;
  paintOrder?: string;
  pathLength?: number;
  patternContentUnits?: string;
  patternTransform?: string;
  patternUnits?: string;
  pointerEvents?: string;
  points?: string;
  preserveAspectRatio?: string;
  r?: number | string;
  result?: string;
  rx?: number | string;
  ry?: number | string;
  shapeRendering?: string;
  stopColor?: string;
  stopOpacity?: number | string;
  stroke?: string;
  strokeDasharray?: string | number;
  strokeDashoffset?: string | number;
  strokeLinecap?: 'butt' | 'round' | 'square';
  strokeLinejoin?: 'miter' | 'round' | 'bevel';
  strokeMiterlimit?: number | string;
  strokeOpacity?: number | string;
  strokeWidth?: number | string;
  textAnchor?: string;
  textDecoration?: string;
  textRendering?: string;
  transform?: string;
  vectorEffect?: string;
  version?: string;
  viewBox?: string;
  visibility?: string;
  wordSpacing?: number | string;
  writingMode?: string;
  x?: number | string;
  x1?: number | string;
  x2?: number | string;
  xlinkActuate?: string;
  xlinkArcrole?: string;
  xlinkHref?: string;
  xlinkRole?: string;
  xlinkShow?: string;
  xlinkTitle?: string;
  xlinkType?: string;
  xmlBase?: string;
  xmlLang?: string;
  xmlSpace?: string;
  y?: number | string;
  y1?: number | string;
  y2?: number | string;
}

/**
 * Script-specific HTML attributes (for the `<Script>` component).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface ScriptHTMLAttributes<T = HTMLScriptElement>
  extends HTMLAttributes<T> {
  async?: boolean;
  crossOrigin?: string;
  defer?: boolean;
  integrity?: string;
  noModule?: boolean;
  nonce?: string;
  referrerPolicy?: string;
  src?: string;
  type?: string;
}

// =============================================================================
// JSX Namespace
// =============================================================================

export namespace JSX {
  export type Element = VNode<any>;

  export interface ElementChildrenAttribute {
    children: {};
  }

  export interface IntrinsicElements {
    // HTML elements
    a: HTMLAttributes<HTMLAnchorElement>;
    abbr: HTMLAttributes;
    address: HTMLAttributes;
    area: HTMLAttributes<HTMLAreaElement>;
    article: HTMLAttributes;
    aside: HTMLAttributes;
    audio: HTMLAttributes<HTMLAudioElement>;
    b: HTMLAttributes;
    base: HTMLAttributes<HTMLBaseElement>;
    bdi: HTMLAttributes;
    bdo: HTMLAttributes;
    big: HTMLAttributes;
    blockquote: HTMLAttributes<HTMLQuoteElement>;
    body: HTMLAttributes<HTMLBodyElement>;
    br: HTMLAttributes<HTMLBRElement>;
    button: HTMLAttributes<HTMLButtonElement>;
    canvas: HTMLAttributes<HTMLCanvasElement>;
    caption: HTMLAttributes;
    cite: HTMLAttributes;
    code: HTMLAttributes;
    col: HTMLAttributes<HTMLTableColElement>;
    colgroup: HTMLAttributes<HTMLTableColElement>;
    data: HTMLAttributes<HTMLDataElement>;
    datalist: HTMLAttributes<HTMLDataListElement>;
    dd: HTMLAttributes;
    del: HTMLAttributes<HTMLModElement>;
    details: HTMLAttributes<HTMLDetailsElement>;
    dfn: HTMLAttributes;
    dialog: HTMLAttributes<HTMLDialogElement>;
    div: HTMLAttributes<HTMLDivElement>;
    dl: HTMLAttributes<HTMLDListElement>;
    dt: HTMLAttributes;
    em: HTMLAttributes;
    embed: HTMLAttributes<HTMLEmbedElement>;
    fieldset: HTMLAttributes<HTMLFieldSetElement>;
    figcaption: HTMLAttributes;
    figure: HTMLAttributes;
    footer: HTMLAttributes;
    form: HTMLAttributes<HTMLFormElement>;
    h1: HTMLAttributes<HTMLHeadingElement>;
    h2: HTMLAttributes<HTMLHeadingElement>;
    h3: HTMLAttributes<HTMLHeadingElement>;
    h4: HTMLAttributes<HTMLHeadingElement>;
    h5: HTMLAttributes<HTMLHeadingElement>;
    h6: HTMLAttributes<HTMLHeadingElement>;
    head: HTMLAttributes<HTMLHeadElement>;
    header: HTMLAttributes;
    hgroup: HTMLAttributes;
    hr: HTMLAttributes<HTMLHRElement>;
    html: HTMLAttributes<HTMLHtmlElement>;
    i: HTMLAttributes;
    iframe: HTMLAttributes<HTMLIFrameElement>;
    img: HTMLAttributes<HTMLImageElement>;
    input: HTMLAttributes<HTMLInputElement>;
    ins: HTMLAttributes<HTMLModElement>;
    kbd: HTMLAttributes;
    label: HTMLAttributes<HTMLLabelElement>;
    legend: HTMLAttributes<HTMLLegendElement>;
    li: HTMLAttributes<HTMLLIElement>;
    link: HTMLAttributes<HTMLLinkElement>;
    main: HTMLAttributes;
    map: HTMLAttributes<HTMLMapElement>;
    mark: HTMLAttributes;
    menu: HTMLAttributes<HTMLMenuElement>;
    meta: HTMLAttributes<HTMLMetaElement>;
    meter: HTMLAttributes<HTMLMeterElement>;
    nav: HTMLAttributes;
    noscript: HTMLAttributes;
    object: HTMLAttributes<HTMLObjectElement>;
    ol: HTMLAttributes<HTMLOListElement>;
    optgroup: HTMLAttributes<HTMLOptGroupElement>;
    option: HTMLAttributes<HTMLOptionElement>;
    output: HTMLAttributes<HTMLOutputElement>;
    p: HTMLAttributes<HTMLParagraphElement>;
    param: HTMLAttributes;
    picture: HTMLAttributes;
    pre: HTMLAttributes<HTMLPreElement>;
    progress: HTMLAttributes<HTMLProgressElement>;
    q: HTMLAttributes<HTMLQuoteElement>;
    rp: HTMLAttributes;
    rt: HTMLAttributes;
    ruby: HTMLAttributes;
    s: HTMLAttributes;
    samp: HTMLAttributes;
    script: ScriptHTMLAttributes<HTMLScriptElement>;
    search: HTMLAttributes;
    section: HTMLAttributes;
    select: HTMLAttributes<HTMLSelectElement>;
    slot: HTMLAttributes<HTMLSlotElement>;
    small: HTMLAttributes;
    source: HTMLAttributes<HTMLSourceElement>;
    span: HTMLAttributes<HTMLSpanElement>;
    strong: HTMLAttributes;
    style: HTMLAttributes<HTMLStyleElement>;
    sub: HTMLAttributes;
    summary: HTMLAttributes;
    sup: HTMLAttributes;
    table: HTMLAttributes<HTMLTableElement>;
    tbody: HTMLAttributes<HTMLTableSectionElement>;
    td: HTMLAttributes<HTMLTableCellElement>;
    template: HTMLAttributes<HTMLTemplateElement>;
    textarea: HTMLAttributes<HTMLTextAreaElement>;
    tfoot: HTMLAttributes<HTMLTableSectionElement>;
    th: HTMLAttributes<HTMLTableCellElement>;
    thead: HTMLAttributes<HTMLTableSectionElement>;
    time: HTMLAttributes<HTMLTimeElement>;
    title: HTMLAttributes<HTMLTitleElement>;
    tr: HTMLAttributes<HTMLTableRowElement>;
    track: HTMLAttributes<HTMLTrackElement>;
    u: HTMLAttributes;
    ul: HTMLAttributes<HTMLUListElement>;
    var: HTMLAttributes;
    video: HTMLAttributes<HTMLVideoElement>;
    wbr: HTMLAttributes;

    // SVG elements
    svg: SVGAttributes<SVGSVGElement>;
    animate: SVGAttributes;
    animateMotion: SVGAttributes;
    animateTransform: SVGAttributes;
    circle: SVGAttributes<SVGCircleElement>;
    clipPath: SVGAttributes;
    defs: SVGAttributes;
    desc: SVGAttributes;
    ellipse: SVGAttributes<SVGEllipseElement>;
    feBlend: SVGAttributes;
    feColorMatrix: SVGAttributes;
    feComponentTransfer: SVGAttributes;
    feComposite: SVGAttributes;
    feConvolveMatrix: SVGAttributes;
    feDiffuseLighting: SVGAttributes;
    feDisplacementMap: SVGAttributes;
    feDistantLight: SVGAttributes;
    feDropShadow: SVGAttributes;
    feFlood: SVGAttributes;
    feFuncA: SVGAttributes;
    feFuncB: SVGAttributes;
    feFuncG: SVGAttributes;
    feFuncR: SVGAttributes;
    feGaussianBlur: SVGAttributes;
    feImage: SVGAttributes;
    feMerge: SVGAttributes;
    feMergeNode: SVGAttributes;
    feMorphology: SVGAttributes;
    feOffset: SVGAttributes;
    fePointLight: SVGAttributes;
    feSpecularLighting: SVGAttributes;
    feSpotLight: SVGAttributes;
    feTile: SVGAttributes;
    feTurbulence: SVGAttributes;
    filter: SVGAttributes;
    foreignObject: SVGAttributes;
    g: SVGAttributes<SVGGElement>;
    image: SVGAttributes<SVGImageElement>;
    line: SVGAttributes<SVGLineElement>;
    linearGradient: SVGAttributes;
    marker: SVGAttributes<SVGMarkerElement>;
    mask: SVGAttributes<SVGMaskElement>;
    metadata: SVGAttributes;
    mpath: SVGAttributes;
    path: SVGAttributes<SVGPathElement>;
    pattern: SVGAttributes<SVGPatternElement>;
    polygon: SVGAttributes<SVGPolygonElement>;
    polyline: SVGAttributes<SVGPolylineElement>;
    radialGradient: SVGAttributes;
    rect: SVGAttributes<SVGRectElement>;
    set: SVGAttributes;
    stop: SVGAttributes;
    switch: SVGAttributes;
    symbol: SVGAttributes<SVGSymbolElement>;
    text: SVGAttributes<SVGTextElement>;
    textPath: SVGAttributes;
    tspan: SVGAttributes<SVGTSpanElement>;
    use: SVGAttributes<SVGUseElement>;
    view: SVGAttributes<SVGViewElement>;
  }
}
