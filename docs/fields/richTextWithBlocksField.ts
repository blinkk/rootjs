import {schema} from '@blinkk/root-cms';

const BLOCKS_MODULES = import.meta.glob('/blocks/*/*.schema.ts', {eager: true});
const ALL_BLOCKS = Object.values(BLOCKS_MODULES).map(
  (module: {default: schema.Schema}) => module.default
);

export type RichTextWithBlocksFieldOptions = Omit<
  schema.RichTextField,
  'type'
> & {
  include?: string[];
  exclude?: string[];
};

export function richTextWithBlocksField(
  options: RichTextWithBlocksFieldOptions
): schema.RichTextField {
  const blockComponents = ALL_BLOCKS.filter((block) => {
    if (options.include) {
      if (!options.include.includes(block.name)) {
        return false;
      }
    }
    if (options.exclude) {
      if (options.exclude.includes(block.name)) {
        return false;
      }
    }
    return true;
  });
  return schema.richtext({...options, blockComponents});
}
