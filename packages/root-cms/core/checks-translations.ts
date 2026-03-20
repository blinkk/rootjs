import {type CMSCheck, type CheckContext, type CheckResult} from './checks.js';
import * as schema from './schema.js';

/**
 * Extracts translatable strings from the document fields based on the
 * collection schema. Walks the field tree and collects strings from fields
 * that have `translate: true`.
 */
function extractTranslatableStrings(
  fields: schema.Field[],
  data: Record<string, any>,
  types: Record<string, schema.Schema>
): Set<string> {
  const strings = new Set<string>();

  function addString(text: string) {
    const normalized = (text || '').trim();
    if (normalized) {
      strings.add(normalized);
    }
  }

  function walkFields(
    fieldDefs: schema.Field[],
    fieldData: Record<string, any>
  ) {
    for (const field of fieldDefs) {
      if (!field.id) {
        continue;
      }
      const value = fieldData[field.id];
      if (!value) {
        continue;
      }

      // Check for "do not translate" metadata.
      const metadataKey = `@${field.id}`;
      const metadata = fieldData[metadataKey];
      if (metadata?.disableTranslations) {
        continue;
      }

      walkField(field, value);
    }
  }

  function walkField(field: schema.Field, value: any) {
    if (!value) {
      return;
    }

    if (field.type === 'string' || field.type === 'select') {
      if ((field as schema.StringField).translate) {
        addString(value);
      }
    } else if (field.type === 'multiselect') {
      if (
        (field as schema.MultiSelectField).translate &&
        Array.isArray(value)
      ) {
        for (const item of value) {
          addString(item);
        }
      }
    } else if (field.type === 'image') {
      if (
        (field as schema.ImageField).translate &&
        value.alt &&
        (field as schema.ImageField).alt !== false
      ) {
        addString(value.alt);
      }
    } else if (field.type === 'richtext') {
      if ((field as schema.RichTextField).translate) {
        extractRichTextStrings(strings, value);
      }
    } else if (field.type === 'object') {
      walkFields((field as schema.ObjectField).fields || [], value);
    } else if (field.type === 'array') {
      const arrayKeys = value._array || [];
      for (const arrayKey of arrayKeys) {
        if (value[arrayKey]) {
          walkField((field as schema.ArrayField).of, value[arrayKey]);
        }
      }
    } else if (field.type === 'oneof') {
      const fieldTypes = (field as schema.OneOfField).types || [];
      let fieldValueType: schema.Schema | undefined;
      if (Array.isArray(fieldTypes) && typeof fieldTypes[0] === 'string') {
        if ((fieldTypes as string[]).includes(value._type)) {
          fieldValueType = types[value._type];
        }
      } else {
        fieldValueType = (fieldTypes as schema.Schema[]).find(
          (item) => item.name === value._type
        );
      }
      if (fieldValueType) {
        walkFields(fieldValueType.fields || [], value);
      }
    }
  }

  walkFields(fields, data);
  return strings;
}

/** Extracts translatable strings from rich text data. */
function extractRichTextStrings(strings: Set<string>, data: any) {
  if (!data || !data.root || !data.root.children) {
    return;
  }
  for (const block of data.root.children) {
    extractRichTextBlock(strings, block);
  }
}

function extractRichTextBlock(strings: Set<string>, block: any) {
  if (!block) {
    return;
  }
  if (block.type === 'paragraph' || block.type === 'heading') {
    const text = extractRichTextNodeText(block);
    if (text.trim()) {
      strings.add(text.trim());
    }
  } else if (block.type === 'list') {
    for (const item of block.children || []) {
      extractRichTextBlock(strings, item);
    }
  } else if (block.type === 'listitem') {
    const text = extractRichTextNodeText(block);
    if (text.trim()) {
      strings.add(text.trim());
    }
  }
}

function extractRichTextNodeText(node: any): string {
  if (!node) {
    return '';
  }
  if (node.type === 'text') {
    return node.text || '';
  }
  if (node.children) {
    return node.children.map(extractRichTextNodeText).join('');
  }
  return '';
}

/**
 * A first-party CMS check that verifies all translatable strings in a document
 * have translations for each of the document's enabled locales.
 */
export function translationsCheck(): CMSCheck {
  return {
    id: 'root-cms/translations',
    label: 'Missing Translations',
    description:
      'Checks that all translatable strings have translations for each enabled locale.',
    run: async (ctx: CheckContext): Promise<CheckResult> => {
      const {cmsClient, collectionId, slug, collectionSchema} = ctx;

      // Fetch the draft document data.
      const rawDoc = await cmsClient.getRawDoc(collectionId, slug, {
        mode: 'draft',
      });
      if (!rawDoc) {
        return {
          status: 'error',
          message: 'Document not found.',
        };
      }

      // Get the schema fields.
      if (!collectionSchema) {
        return {
          status: 'warning',
          message:
            'Could not load collection schema. Unable to check translations.',
        };
      }

      const fields = collectionSchema.fields || [];
      const schemaTypes = collectionSchema.types || {};
      const docFields = rawDoc.fields || {};

      // Extract translatable strings from the document.
      const sourceStrings = extractTranslatableStrings(
        fields,
        docFields,
        schemaTypes as Record<string, schema.Schema>
      );
      if (sourceStrings.size === 0) {
        return {
          status: 'success',
          message: 'No translatable strings found in this document.',
        };
      }

      // Get document's enabled locales (excluding the default "en" locale).
      const locales: string[] = (rawDoc.sys?.locales || ['en']).filter(
        (l: string) => l !== 'en'
      );
      if (locales.length === 0) {
        return {
          status: 'success',
          message: `Found **${sourceStrings.size}** translatable string(s), but no non-default locales are enabled.`,
        };
      }

      // Load all translations tagged to this document.
      const docId = `${collectionId}/${slug}`;
      const translationsMap = await cmsClient.loadTranslations({
        tags: [docId],
      });

      // Build a map from source string to available translations.
      const sourceToTranslations: Map<
        string,
        Record<string, string>
      > = new Map();
      for (const [, translation] of Object.entries(translationsMap)) {
        const source = (translation.source || '').trim();
        if (source) {
          const localeMap: Record<string, string> = {};
          for (const [key, value] of Object.entries(translation)) {
            if (
              key !== 'source' &&
              key !== 'tags' &&
              typeof value === 'string'
            ) {
              localeMap[key] = value;
            }
          }
          sourceToTranslations.set(source, localeMap);
        }
      }

      // Check each source string for missing locale translations.
      const missingByLocale: Record<string, string[]> = {};
      let totalMissing = 0;

      for (const source of sourceStrings) {
        const translations = sourceToTranslations.get(source);
        for (const locale of locales) {
          if (!translations || !translations[locale]) {
            if (!missingByLocale[locale]) {
              missingByLocale[locale] = [];
            }
            missingByLocale[locale].push(source);
            totalMissing++;
          }
        }
      }

      if (totalMissing === 0) {
        return {
          status: 'success',
          message: `All **${sourceStrings.size}** translatable string(s) have translations for ${locales.length} locale(s).`,
        };
      }

      // Build a detailed markdown message.
      const lines: string[] = [];
      lines.push(
        `Found **${totalMissing}** missing translation(s) across **${
          Object.keys(missingByLocale).length
        }** locale(s):\n`
      );
      for (const [locale, missing] of Object.entries(missingByLocale)) {
        lines.push(`**${locale}** — ${missing.length} missing:`);
        const shown = missing.slice(0, 5);
        for (const str of shown) {
          const truncated =
            str.length > 80 ? str.substring(0, 80) + '...' : str;
          lines.push(`- \`${truncated}\``);
        }
        if (missing.length > 5) {
          lines.push(`- ...and ${missing.length - 5} more`);
        }
        lines.push('');
      }

      return {
        status: totalMissing > 0 ? 'warning' : 'success',
        message: lines.join('\n'),
        metadata: {totalMissing, missingByLocale},
      };
    },
  };
}
