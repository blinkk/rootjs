import {describe, expect, it} from 'vitest';

import {serializeJsonForScript} from './safe-json.js';

const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);

describe('serializeJsonForScript', () => {
  it('escapes </script> sequences inside string values', () => {
    const out = serializeJsonForScript({
      x: '</script><script>alert(1)</script>',
    });
    expect(out).not.toContain('</script>');
    expect(out).toContain('\\u003c/script\\u003e');
  });

  it('escapes <!-- sequences', () => {
    const out = serializeJsonForScript({x: '<!--inside-->'});
    expect(out).not.toContain('<!--');
  });

  it('escapes ampersands', () => {
    const out = serializeJsonForScript({x: 'a&b'});
    expect(out).not.toContain('&');
    expect(out).toContain('\\u0026');
  });

  it('escapes U+2028 and U+2029 line terminators', () => {
    const out = serializeJsonForScript({x: `a${LS}b${PS}c`});
    expect(out).not.toContain(LS);
    expect(out).not.toContain(PS);
    expect(out).toContain('\\u2028');
    expect(out).toContain('\\u2029');
  });

  it('round-trips through JSON.parse', () => {
    const value = {
      name: 'project</script>',
      tags: ['a&b', 'c<d'],
      meta: {body: `paragraph${PS}break`},
    };
    const out = serializeJsonForScript(value);
    expect(JSON.parse(out)).toEqual(value);
  });
});
