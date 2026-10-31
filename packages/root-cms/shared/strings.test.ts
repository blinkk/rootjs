import {describe, it, expect} from 'vitest';
import {hashStr} from './strings.js';

describe('hashStr', () => {
  it('generates consistent hash for input', () => {
    const input = 'hello world';
    // Run the hash twice to verify the output is consistent.
    const hash1 = hashStr(input);
    const hash2 = hashStr(input);
    expect(hash1).toMatchInlineSnapshot('"a65e7023cd59e"');
    expect(hash1).toEqual(hash2);
  });

  it('keeps hashes stable, since they are stored in the database', () => {
    expect(hashStr('a')).toEqual('3dc4c8601e67a');
    expect(hashStr('Página de inicio')).toEqual('e4329783d7185');
    expect(hashStr('日本語のテキスト')).toEqual('5b07ebf2cfeb5');
    expect(hashStr('emoji 😀 text')).toEqual('2fc3e22f97484');
    expect(hashStr('line one\nline two')).toEqual('67175b16e91ad');
  });

  it('generates the same hash for strings with leading and trailing whitespace', () => {
    const input1 = 'hello test';
    const input2 = 'hello test ';
    const input3 = '   hello test  ';
    const input4 = 'hello test&nbsp;';
    const hash1 = hashStr(input1);
    const hash2 = hashStr(input2);
    const hash3 = hashStr(input3);
    const hash4 = hashStr(input4);
    expect(hash1).toMatchInlineSnapshot('"5a364db8899ed"');
    expect(hash1).toEqual(hash2);
    expect(hash1).toEqual(hash3);
    expect(hash1).toEqual(hash4);
  });
});
