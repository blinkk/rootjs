import {describe, it, expect} from 'vitest';
import {parseClientDts} from './client-reflect.js';

const SAMPLE_DTS = `
import { type RootConfig } from '@blinkk/root';
export interface Doc<Fields = any> {
    id: string;
    fields: Fields;
}
export type DocMode = 'draft' | 'published';
/**
 * Options for getting a doc.
 */
export interface GetDocOptions {
    mode: DocMode;
}
export declare class RootCMSClient {
    readonly projectId: string;
    constructor(rootConfig: RootConfig);
    /**
     * Converts a doc mode to the Firestore collection name.
     */
    private getModeCollection;
    /**
     * Retrieves doc data from Root.js CMS.
     */
    getDoc<Fields = any>(collectionId: string, slug: string, options: GetDocOptions): Promise<Doc<Fields> | null>;
    /**
     * Fetches data from a data source.
     */
    getFromDataSource<T = any>(dataSourceId: string, options?: {
        mode?: 'draft' | 'published';
    }): Promise<T | null>;
    private fetchData;
    publishScheduledDocs(): Promise<any[]>;
}
export declare function isRichTextData(data: any): boolean;
`;

describe('parseClientDts', () => {
  const info = parseClientDts(SAMPLE_DTS);

  it('extracts public methods only (skips private and constructor)', () => {
    const names = info.methods.map((m) => m.name);
    expect(names).toEqual([
      'getDoc',
      'getFromDataSource',
      'publishScheduledDocs',
    ]);
  });

  it('captures method signatures and descriptions', () => {
    const getDoc = info.methods.find((m) => m.name === 'getDoc')!;
    expect(getDoc.description).toBe('Retrieves doc data from Root.js CMS.');
    expect(getDoc.signature).toBe(
      'getDoc<Fields = any>(collectionId: string, slug: string, options: GetDocOptions): Promise<Doc<Fields> | null>'
    );
  });

  it('handles multi-line signatures with inline object types', () => {
    const method = info.methods.find((m) => m.name === 'getFromDataSource')!;
    expect(method.signature).toBe(
      "getFromDataSource<T = any>(dataSourceId: string, options?: { mode?: 'draft' | 'published'; }): Promise<T | null>"
    );
  });

  it('handles zero-arg methods', () => {
    const method = info.methods.find((m) => m.name === 'publishScheduledDocs')!;
    expect(method.signature).toBe('publishScheduledDocs(): Promise<any[]>');
  });

  it('extracts top-level interfaces and type aliases', () => {
    const typeNames = info.types.map((t) => t.name);
    expect(typeNames).toContain('Doc');
    expect(typeNames).toContain('DocMode');
    expect(typeNames).toContain('GetDocOptions');
    // The client class itself is not a "type".
    expect(typeNames).not.toContain('RootCMSClient');
  });

  it('captures interface descriptions', () => {
    const getDocOptions = info.types.find((t) => t.name === 'GetDocOptions')!;
    expect(getDocOptions.description).toBe('Options for getting a doc.');
    expect(getDocOptions.declaration).toContain('mode: DocMode;');
  });
});
