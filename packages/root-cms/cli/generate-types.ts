import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadRootConfig, viteSsrLoadModule} from '@blinkk/root/node';
import * as dom from 'dts-dom';

import {Field, Schema} from '../core/schema.js';

type ProjectModule = typeof import('../core/project.js');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function generateTypes() {
  const rootDir = process.cwd();
  const rootConfig = await loadRootConfig(rootDir, {command: 'root-cms'});
  const modulePath = path.resolve(__dirname, './project.js');
  const project = (await viteSsrLoadModule(
    rootConfig,
    modulePath
  )) as ProjectModule;
  const schemas = project.getProjectSchemas();
  console.log(`generating root-cms.d.ts from ${rootDir}...`);
  const outputPath = path.resolve(rootDir, 'root-cms.d.ts');
  await generateSchemaDts(outputPath, schemas);
  console.log('saved root-cms.d.ts!');
}

const TEMPLATE = `/** Root.js CMS types. This file is autogenerated. */

export interface RootCMSImage {
  src: string;
  width?: number;
  height?: number;
  alt?: string;
}

export type RootCMSOneOf<T = any> = T & {
  _type: string;
};

export interface RootCMSRichTextBlock {
  type: string;
  data: any;
}

export interface RootCMSRichText {
  blocks: RootCMSRichTextBlock[];
}

export interface RootCMSReference {
  /** The id of the doc, e.g. "Pages/foo-bar". */
  id: string;
  /** The collection id of the doc, e.g. "Pages". */
  collection: string;
  /** The slug of the doc, e.g. "foo-bar". */
  slug: string;
}

export interface RootCMSDoc<Fields extends {}> {
  /** The id of the doc, e.g. "Pages/foo-bar". */
  id: string;
  /** The collection id of the doc, e.g. "Pages". */
  collection: string;
  /** The slug of the doc, e.g. "foo-bar". */
  slug: string;
  /** System-level metadata. */
  sys: {
    createdAt: number;
    createdBy: string;
    modifiedAt: number;
    modifiedBy: string;
    firstPublishedAt?: number;
    firstPublishedBy?: string;
    publishedAt?: number;
    publishedBy?: string;
    locales?: string[];
  };
  /** User-entered field values from the CMS. */
  fields?: Fields;
}`;

/**
 * Generates a root-cms.d.ts file from the .schema.ts files in the project.
 */
export async function generateSchemaDts(
  outputPath: string,
  schemas: Record<string, Schema>
) {
  const results = [TEMPLATE];
  for (const fileId in schemas) {
    const schema = schemas[fileId];
    results.push(renderSchema(fileId, schema));
  }
  const output = results
    .join('\n\n')
    .replaceAll('/**  ', '/** ')
    .replaceAll('  */', ' */')
    .replace(/\r\n|\r|\n/g, '\n');
  await fs.writeFile(outputPath, output, 'utf-8');
}

function fieldProperty(field: Field): dom.PropertyDeclaration {
  const prop = dom.create.property(
    field.id!,
    fieldType(field),
    dom.DeclarationFlags.Optional
  );
  const jsdoc = [];
  if (field.label) {
    if (field.help) {
      jsdoc.push(`${field.label}. ${field.help}`);
    } else {
      jsdoc.push(field.label);
    }
  }
  if (field.deprecated) {
    jsdoc.push('@deprecated');
  }
  if (jsdoc.length > 0) {
    prop.jsDocComment = jsdoc.join('\n');
  }
  return prop;
}

function fieldType(field: Field): dom.Type {
  if (field.type === 'array') {
    return dom.type.array(fieldType(field.of));
  }
  if (field.type === 'boolean') {
    return dom.type.boolean;
  }
  if (field.type === 'date') {
    return dom.type.string;
  }
  if (field.type === 'datetime') {
    return dom.type.number;
  }
  if (field.type === 'image') {
    const imageType = dom.create.namedTypeReference('RootCMSImage');
    return imageType;
  }
  if (field.type === 'file') {
    return dom.create.objectType([dom.create.property('src', dom.type.string)]);
  }
  if (field.type === 'multiselect') {
    return dom.type.array(dom.type.string);
  }
  if (field.type === 'oneof') {
    const oneofType = dom.create.namedTypeReference('RootCMSOneOf');
    return oneofType;
  }
  if (field.type === 'reference') {
    const referenceType = dom.create.namedTypeReference('RootCMSReference');
    return referenceType;
  }
  if (field.type === 'richtext') {
    const richtextType = dom.create.namedTypeReference('RootCMSRichText');
    return richtextType;
  }
  if (field.type === 'select') {
    return dom.type.string;
  }
  if (field.type === 'string') {
    return dom.type.string;
  }
  if (field.type === 'object') {
    const subproperties = (field.fields || []).map((f) => fieldProperty(f));
    return dom.create.objectType(subproperties);
  }
  return dom.type.unknown;
}

function renderSchema(fileId: string, schema: Schema): string {
  const jsdoc = `Generated from \`${fileId}\`.`;
  const id = path.parse(fileId).name.split('.')[0];
  const fieldsInterface = `${id}Fields`;
  const fields = dom.create.interface(
    fieldsInterface,
    dom.DeclarationFlags.Export
  );
  fields.jsDocComment = jsdoc;
  for (const field of schema.fields) {
    if (!field.id) {
      continue;
    }
    fields.members.push(fieldProperty(field));
  }

  const fieldsTypeOutput = dom
    .emit(fields, {singleLineJsDocComments: true})
    .trim();
  if (fileId.startsWith('/collections/')) {
    const baseType = dom.create.namedTypeReference('RootCMSDoc');
    baseType.typeArguments.push(dom.create.namedTypeReference(fieldsInterface));
    const docType = dom.create.alias(
      `${id}Doc`,
      baseType,
      dom.DeclarationFlags.Export
    );
    docType.jsDocComment = jsdoc;

    const docTypeOutput = dom
      .emit(docType, {singleLineJsDocComments: true})
      .trim();
    return reindent(fieldsTypeOutput + '\n\n' + docTypeOutput);
  }
  return reindent(fieldsTypeOutput);
}

/**
 * Converts 4-space indents to 2.
 */
function reindent(input: string): string {
  const lines = input.split('\n');
  const results: string[] = [];
  for (const line of lines) {
    const convertedLine = line.replace(/ {4}/g, '  ');
    results.push(convertedLine);
  }
  return results.join('\n');
}
