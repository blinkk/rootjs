export interface RichTextBlock {
  type: string;
  data?: any;
}

export interface RichTextData {
  [key: string]: any;
  blocks: any[];
}
