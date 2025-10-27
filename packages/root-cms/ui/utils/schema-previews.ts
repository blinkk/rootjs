import * as schema from '../../core/schema.js';
import {RichTextData, testValidRichTextData} from '../../shared/richtext.js';
import {getNestedValue} from './objects.js';
import {strFormatFn} from './str-format.js';

class PlaceholderNotFoundError extends Error {}

interface BuildPreviewOptions {
  index?: number;
}

export function getSchemaPreviewTitle(
  schemaDef: schema.Schema,
  data: any,
  options?: BuildPreviewOptions
): string | undefined {
  const previews = schemaDef.preview?.title;
  if (!previews) {
    return undefined;
  }
  return buildPreviewValue(previews, data, options);
}

export function getSchemaPreviewImage(
  schemaDef: schema.Schema,
  data: any,
  options?: BuildPreviewOptions
): string | undefined {
  const previews = schemaDef.preview?.image;
  if (!previews) {
    return undefined;
  }
  return buildPreviewValue(previews, data, options);
}

export function buildPreviewValue(
  previews: string | string[] | undefined,
  data: any,
  options?: BuildPreviewOptions
): string | undefined {
  if (!previews) {
    return undefined;
  }
  const templates = Array.isArray(previews) ? previews : [previews];
  const index = options?.index;

  const getPlaceholder = (key: string) => {
    if (index !== undefined) {
      if (key === '_index' || key === '_index0') {
        return String(index);
      }
      if (key === '_index1') {
        return String(index + 1);
      }
      if (key === '_index:02') {
        return String(index).padStart(2, '0');
      }
      if (key === '_index:03') {
        return String(index).padStart(3, '0');
      }
    }
    const val = getNestedValue(data, key);
    if (!val) {
      throw new PlaceholderNotFoundError(key);
    }
    if (testValidRichTextData(val)) {
      const richTextPreview = getRichTextPreview(val as RichTextData);
      if (richTextPreview) {
        return richTextPreview;
      }
    }
    return String(val);
  };

  for (const template of templates) {
    try {
      const preview = strFormatFn(template, getPlaceholder);
      return preview;
    } catch (err) {
      if (err instanceof PlaceholderNotFoundError) {
        continue;
      }
      throw err;
    }
  }
  return undefined;
}

export function getRichTextPreview(data: RichTextData): string | undefined {
  const blocks = data?.blocks || [];
  for (const block of blocks) {
    if (block.type === 'paragraph') {
      let text = block.data?.text || '';
      text = text.replace(/<br\s*\/?>/gi, '\n');
      text = text.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');
      const firstLine = text.split(/\r?\n/)[0].trim();
      if (firstLine) {
        return firstLine;
      }
    }
  }
  return undefined;
}
