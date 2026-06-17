/* eslint-disable n/no-extraneous-import */
/* eslint-disable prettier/prettier */
/** @jsxImportSource . */

import {expect, test} from 'vitest';
import {renderJsxToString} from './jsx-render.js';
import {createContext, useContext} from './jsx-runtime.js';

declare module './types.js' {
  namespace JSX {
    interface IntrinsicElements {
      'root-test-card': Record<string, any>;
    }
  }
}

test('renders basic html elements', () => {
  const vnode = <div class="hello">world</div>;
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe('<div class="hello">world</div>');
});

test('renders void elements without closing tags', () => {
  const vnode = (
    <div>
      <img src="test.png" alt="test" />
      <br />
      <input type="text" />
    </div>
  );
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe(
    '<div><img src="test.png" alt="test"><br><input type="text"></div>'
  );
});

test('renders boolean attributes', () => {
  const vnode = <input type="checkbox" checked disabled />;
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe('<input type="checkbox" checked disabled>');
});

test('renders disableRemotePlayback as a boolean attribute', () => {
  const vnode = <video disableRemotePlayback />;
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe('<video disableremoteplayback></video>');
});

test('renders popover as a boolean attribute', () => {
  // `<div popover />` should minimize to `popover` (treated as "auto" by the
  // browser) rather than rendering an invalid `popover="true"` value.
  expect(renderJsxToString(<div popover />, {mode: 'minimal'})).toBe(
    '<div popover></div>'
  );
  // `popover={false}` removes the attribute.
  expect(
    renderJsxToString(<div popover={false} />, {mode: 'minimal'})
  ).toBe('<div></div>');
  // Explicit string values are preserved.
  expect(
    renderJsxToString(<div popover="manual" />, {mode: 'minimal'})
  ).toBe('<div popover="manual"></div>');
});

test('handles falsy attribute values', () => {
  // true: boolean attrs are minimized, non-boolean attrs render as "true"
  expect(
    renderJsxToString(<div id={true as any} hidden data-hidden={true} />, {mode: 'minimal'})
  ).toBe('<div id="true" hidden data-hidden="true"></div>');

  // false: standard/boolean removed, data-* rendered as "false"
  expect(
    renderJsxToString(<div id={false as any} hidden={false} data-hidden={false} />, {mode: 'minimal'})
  ).toBe('<div id="false" data-hidden="false"></div>');

  // null: all removed
  expect(
    renderJsxToString(<div id={null} hidden={null as any} data-hidden={null} />, {mode: 'minimal'})
  ).toBe('<div></div>');

  // undefined: all removed
  expect(
    renderJsxToString(<div id={undefined} hidden={undefined as any} data-hidden={undefined} />, {mode: 'minimal'})
  ).toBe('<div></div>');

  // "": all rendered
  expect(
    renderJsxToString(<div id="" hidden={'' as any} data-hidden="" />, {mode: 'minimal'})
  ).toBe('<div id="" hidden="" data-hidden=""></div>');

  // 0: all rendered as "0"
  expect(
    renderJsxToString(<div id={0 as any} hidden={0 as any} data-hidden={0} />, {mode: 'minimal'})
  ).toBe('<div id="0" hidden="0" data-hidden="0"></div>');
});

test('escapes html entities in text', () => {
  const vnode = <div>{'<script>alert("xss")</script>'}</div>;
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  // Quotes don't need escaping in text content, only &, <, > do.
  expect(output).toBe('<div>&lt;script&gt;alert("xss")&lt;/script&gt;</div>');
});

test('escapes html entities in attributes', () => {
  const vnode = <div title={'he said "hello" & goodbye'} />;
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe(
    '<div title="he said &quot;hello&quot; &amp; goodbye"></div>'
  );
});

// Boundary cases for the escape fast-path (a no-match precheck that returns the
// input unchanged before entering the per-character escape loop): specials at
// the very start/end of a string, consecutive specials, and a lone special.
test('escapes specials at string boundaries in text', () => {
  const vnode = <div>{'<a & b>'}</div>;
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe('<div>&lt;a &amp; b&gt;</div>');
});

test('escapes consecutive specials in text', () => {
  const vnode = <div>{'&&<<>>'}</div>;
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe('<div>&amp;&amp;&lt;&lt;&gt;&gt;</div>');
});

test('escapes quote at attribute boundaries', () => {
  const vnode = <div title={'"x"'} />;
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe('<div title="&quot;x&quot;"></div>');
});

test('leaves strings without specials unchanged', () => {
  const vnode = <div title="plain value">{'no specials here'}</div>;
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe('<div title="plain value">no specials here</div>');
});

test('renders dangerouslySetInnerHTML', () => {
  const vnode = <div dangerouslySetInnerHTML={{__html: '<b>raw</b>'}} />;
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe('<div><b>raw</b></div>');
});

test('renders style objects', () => {
  const vnode = <div style={{color: 'red', fontSize: '14px'}} />;
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe('<div style="color:red;font-size:14px"></div>');
});

test('maps JSX prop names to HTML attributes', () => {
  const vnode = (
    <div>
      <meta charSet="utf-8" />
      <label htmlFor="name" tabIndex={0} />
    </div>
  );
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe(
    '<div><meta charset="utf-8"><label for="name" tabindex="0"></label></div>'
  );
});

test('renders functional components', () => {
  function Greeting(props: {name: string}) {
    return <span>Hello, {props.name}!</span>;
  }
  const vnode = <Greeting name="World" />;
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe('<span>Hello, World!</span>');
});

test('renders nested components', () => {
  function Inner() {
    return <em>inner</em>;
  }
  function Outer() {
    return (
      <div>
        <Inner />
      </div>
    );
  }
  const vnode = <Outer />;
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe('<div><em>inner</em></div>');
});

test('renders fragments', () => {
  function List() {
    return (
      <>
        <li>a</li>
        <li>b</li>
      </>
    );
  }
  const vnode = <List />;
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe('<li>a</li><li>b</li>');
});

test('renders context providers and useContext', () => {
  const MyContext = createContext('default');
  function Consumer() {
    const value = useContext(MyContext);
    return <span>{value}</span>;
  }
  const vnode = (
    <MyContext.Provider value="provided">
      <Consumer />
    </MyContext.Provider>
  );
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe('<span>provided</span>');
});

test('renders nested context providers', () => {
  const MyContext = createContext('default');
  function Consumer() {
    const value = useContext(MyContext);
    return <span>{value}</span>;
  }
  const vnode = (
    <MyContext.Provider value="outer">
      <div>
        <Consumer />
        <MyContext.Provider value="inner">
          <Consumer />
        </MyContext.Provider>
      </div>
    </MyContext.Provider>
  );
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe('<div><span>outer</span><span>inner</span></div>');
});

test('renders numbers and ignores booleans/null', () => {
  const vnode = (
    <div>
      {42}
      {true}
      {false}
      {null}
      {undefined}
      {'text'}
    </div>
  );
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe('<div>42text</div>');
});

test('skips function event handlers', () => {
  const vnode = (
    <button onClick={() => {}} onMouseOver={() => {}}>
      click
    </button>
  );
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe('<button>click</button>');
});

test('preserves string event handlers', () => {
  const vnode = (
    <select onChange={'this.form.submit()'}>
      <option value="a">a</option>
    </select>
  );
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe(
    '<select onChange="this.form.submit()"><option value="a">a</option></select>'
  );
});

test('preserves and escapes string event handlers, skips function ones', () => {
  const vnode = (
    <button onClick={'doStuff("a" & "b")'} onMouseOver={() => {}}>
      click
    </button>
  );
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe(
    '<button onClick="doStuff(&quot;a&quot; &amp; &quot;b&quot;)">click</button>'
  );
});

test('skips function-valued non-event props', () => {
  const vnode = <div title={(() => 'x') as any} />;
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe('<div></div>');
});

// --- Pretty mode tests ---

test('pretty mode: block elements on their own line', () => {
  const vnode = (
    <div>
      <p>hello</p>
      <p>world</p>
    </div>
  );
  const output = renderJsxToString(vnode, {mode: 'pretty'});
  expect(output).toBe(`<div>
<p>hello</p>
<p>world</p>
</div>
`);
});

test('pretty mode: inline elements stay inline', () => {
  const vnode = (
    <p>
      Hello <strong>world</strong> and <em>more</em>
    </p>
  );
  const output = renderJsxToString(vnode, {mode: 'pretty'});
  expect(output).toBe(`<p>Hello <strong>world</strong> and <em>more</em></p>
`);
});

test('pretty mode: inline div elements stay inline', () => {
  const vnode = (
    <div>
      Hello <div>world</div> and <div>more</div>
    </div>
  );
  const output = renderJsxToString(vnode, {mode: 'pretty'});
  expect(output).toBe(`<div>Hello <div>world</div> and <div>more</div></div>
`);
});

// TODO(stevenle): fix this test.
// test('pretty mode: inline div without whitespace should stay inline', () => {
//   const vnode = (
//     <div>
//       <div>1</div><div>2</div><div>3</div>
//     </div>
//   );
//   const output = renderJsxToString(vnode, {mode: 'pretty'});
//   expect(output).toBe(`<div>
// <div>1</div><div>2</div><div>3</div>
// </div>
// `);
// });

test('pretty mode: void block elements get newlines', () => {
  const vnode = (
    <head>
      <meta charSet="utf-8" />
      <link rel="stylesheet" href="style.css" />
    </head>
  );
  const output = renderJsxToString(vnode, {mode: 'pretty'});
  expect(output).toBe(`<head>
<meta charset="utf-8">
<link rel="stylesheet" href="style.css">
</head>
`);
});

test('pretty mode: base element is block', () => {
  const vnode = (
    <head>
      <base href="/" />
      <link rel="stylesheet" href="a.css" />
    </head>
  );
  const output = renderJsxToString(vnode, {mode: 'pretty'});
  expect(output).toBe(`<head>
<base href="/">
<link rel="stylesheet" href="a.css">
</head>
`);
});

test('pretty mode: metadata elements stay block within mixed content', () => {
  // A stray text/expression node alongside elements triggers the inline
  // heuristic, but non-visual metadata/resource elements (meta/link/script/
  // style/base/title) should still each render on their own line.
  const vnode = (
    <head>
      {'text'}
      <meta charSet="utf-8" />
      <link rel="stylesheet" href="a.css" />
      <script src="a.js"></script>
      <style>{'.x{color:red}'}</style>
    </head>
  );
  const output = renderJsxToString(vnode, {mode: 'pretty'});
  expect(output).toBe(`<head>
text<meta charset="utf-8">
<link rel="stylesheet" href="a.css">
<script src="a.js"></script>
<style>.x{color:red}</style>
</head>
`);
});

test('pretty mode: script/style break onto their own line beside text', () => {
  const vnode = (
    <div>
      content
      <script src="x.js"></script>
      <style>{'.y{color:blue}'}</style>
    </div>
  );
  const output = renderJsxToString(vnode, {mode: 'pretty'});
  expect(output).toBe(`<div>
content<script src="x.js"></script>
<style>.y{color:blue}</style>
</div>
`);
});

test('pretty mode: custom block elements', () => {
  const vnode = (
    <div>
      <root-test-card>content</root-test-card>
      <span>inline</span>
    </div>
  );
  const output = renderJsxToString(vnode, {
    mode: 'pretty',
    blockElements: ['root-test-card'],
  });
  expect(output).toBe(`<div>
<root-test-card>content</root-test-card>
<span>inline</span></div>
`);
});

test('pretty mode: select renders each option on its own line', () => {
  const vnode = (
    <select name="color">
      <option value="r">Red</option>
      <option value="g">Green</option>
    </select>
  );
  const output = renderJsxToString(vnode, {mode: 'pretty'});
  expect(output).toBe(`<select name="color">
<option value="r">Red</option>
<option value="g">Green</option>
</select>
`);
});

test('pretty mode: select with optgroups breaks onto their own lines', () => {
  const vnode = (
    <select name="food">
      <optgroup label="Fruit">
        <option value="a">Apple</option>
        <option value="b">Banana</option>
      </optgroup>
    </select>
  );
  const output = renderJsxToString(vnode, {mode: 'pretty'});
  expect(output).toBe(`<select name="food">
<optgroup label="Fruit">
<option value="a">Apple</option>
<option value="b">Banana</option>
</optgroup>
</select>
`);
});

test('minimal mode: select options stay compact', () => {
  const vnode = (
    <select name="color">
      <option value="r">Red</option>
      <option value="g">Green</option>
    </select>
  );
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe(
    '<select name="color"><option value="r">Red</option><option value="g">Green</option></select>'
  );
});

test('minimal mode: no extra whitespace', () => {
  const vnode = (
    <html>
      <head>
        <title>Test</title>
      </head>
      <body>
        <div>
          <p>hello</p>
        </div>
      </body>
    </html>
  );
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe(
    '<html><head><title>Test</title></head><body><div><p>hello</p></div></body></html>'
  );
});

test('default mode is pretty', () => {
  const vnode = (
    <div>
      <p>hello</p>
    </div>
  );
  const output = renderJsxToString(vnode);
  expect(output).toBe(`<div>
<p>hello</p>
</div>
`);
});

// --- Whitespace handling with inline elements (minimal mode) ---

test('minimal mode: preserves space between inline elements', () => {
  const vnode = (
    <div>
      <span>foo</span> <span>bar</span>
    </div>
  );
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe('<div><span>foo</span> <span>bar</span></div>');
});

test('minimal mode: preserves space between text and inline element', () => {
  const vnode = (
    <p>
      Hello <strong>world</strong>
    </p>
  );
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe('<p>Hello <strong>world</strong></p>');
});

test('minimal mode: preserves space after inline element', () => {
  const vnode = (
    <p>
      <em>Hello</em> world
    </p>
  );
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe('<p><em>Hello</em> world</p>');
});

test('minimal mode: preserves spaces between multiple inline elements', () => {
  const vnode = (
    <p>
      <span>a</span> <span>b</span> <span>c</span>
    </p>
  );
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe('<p><span>a</span> <span>b</span> <span>c</span></p>');
});

test('minimal mode: preserves space with anchor tags', () => {
  const vnode = (
    <p>
      Visit <a href="/about">our site</a> for more info.
    </p>
  );
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe(
    '<p>Visit <a href="/about">our site</a> for more info.</p>'
  );
});

test('minimal mode: no space between inline elements on separate lines', () => {
  const vnode = (
    <div>
      <span>foo</span>
      <span>bar</span>
    </div>
  );
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe('<div><span>foo</span><span>bar</span></div>');
});

test('minimal mode: no space between text and element on separate lines', () => {
  const vnode = (
    <p>
      Hello
      <strong>world</strong>
    </p>
  );
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe('<p>Hello<strong>world</strong></p>');
});

test('minimal mode: no space between element and text on separate lines', () => {
  const vnode = (
    <p>
      <em>Hello</em>
      world
    </p>
  );
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe('<p><em>Hello</em>world</p>');
});

test('minimal mode: multiple inline elements on separate lines', () => {
  const vnode = (
    <p>
      <span>a</span>
      <span>b</span>
      <span>c</span>
    </p>
  );
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe('<p><span>a</span><span>b</span><span>c</span></p>');
});

test('minimal mode: explicit space expression between inline elements', () => {
  const vnode = (
    <p>
      <span>a</span>{' '}
      <span>b</span>
    </p>
  );
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe('<p><span>a</span> <span>b</span></p>');
});

test('textarea: renders value as text content', () => {
  const vnode = <textarea value="hello world" />;
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe('<textarea>hello world</textarea>');
});

test('textarea: children take precedence over value prop', () => {
  const vnode = <textarea value="ignored">explicit children</textarea>;
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe('<textarea>explicit children</textarea>');
});

test('textarea: escapes html in value', () => {
  const vnode = <textarea value={'<script>alert("xss")</script>'} />;
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe(
    '<textarea>&lt;script&gt;alert("xss")&lt;/script&gt;</textarea>'
  );
});

test('pretty mode: pre tag with newlines in text content', () => {
  const vnode = <pre>{'a\nb'}</pre>;
  const output = renderJsxToString(vnode, {mode: 'pretty'});
  // Should NOT inject an extra leading newline before the text content.
  expect(output).toBe('<pre>a\nb</pre>\n');
});

test('pretty mode: script tag with newlines in text content', () => {
  const vnode = <script>{'var a = 1;\nvar b = 2;'}</script>;
  const output = renderJsxToString(vnode, {mode: 'pretty'});
  expect(output).toBe('<script>var a = 1;\nvar b = 2;</script>\n');
});

test('pretty mode: style tag with newlines in text content', () => {
  const vnode = <style>{'body {\n  color: red;\n}'}</style>;
  const output = renderJsxToString(vnode, {mode: 'pretty'});
  expect(output).toBe('<style>body {\n  color: red;\n}</style>\n');
});

// --- SVG attribute tests ---

test('svg: converts strokeWidth to stroke-width', () => {
  const vnode = <path strokeWidth="2" />;
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe('<path stroke-width="2"></path>');
});

test('svg: converts stopColor to stop-color', () => {
  const vnode = <stop stopColor="blue" offset="0%" />;
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe('<stop stop-color="blue" offset="0%"></stop>');
});

test('svg: converts stopOpacity to stop-opacity', () => {
  const vnode = <stop stopOpacity="0.5" />;
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe('<stop stop-opacity="0.5"></stop>');
});

test('svg: converts fillOpacity and fillRule', () => {
  const vnode = <path fillOpacity="0.5" fillRule="evenodd" />;
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe('<path fill-opacity="0.5" fill-rule="evenodd"></path>');
});

test('svg: converts stroke-related attributes', () => {
  const vnode = (
    <line
      strokeDasharray="5,5"
      strokeDashoffset="2"
      strokeLinecap="round"
      strokeLinejoin="miter"
      strokeOpacity="0.8"
    />
  );
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe(
    '<line stroke-dasharray="5,5" stroke-dashoffset="2" stroke-linecap="round" stroke-linejoin="miter" stroke-opacity="0.8"></line>'
  );
});

test('svg: converts clipPath and clipRule', () => {
  const vnode = <rect clipPath="url(#clip)" clipRule="evenodd" />;
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe(
    '<rect clip-path="url(#clip)" clip-rule="evenodd"></rect>'
  );
});

test('svg: converts text presentation attributes', () => {
  const vnode = <text textAnchor="middle" textDecoration="underline" dominantBaseline="central" />;
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe(
    '<text text-anchor="middle" text-decoration="underline" dominant-baseline="central"></text>'
  );
});

test('svg: preserves non-mapped attributes like viewBox', () => {
  const vnode = (
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="40" />
    </svg>
  );
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe(
    '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="40"></circle></svg>'
  );
});

// Regression tests for the pretty-mode newline propagation that decides whether
// a block element's children start on their own line. The renderer threads a
// "did this subtree emit a newline" flag up through the recursion instead of
// re-scanning each element's concatenated inner HTML; these cases pin the
// observable formatting so that optimization stays behavior-preserving.

test('pretty mode: deeply nested blocks each break onto their own line', () => {
  const vnode = (
    <main>
      <section>
        <ul>
          <li>one</li>
          <li>two</li>
        </ul>
      </section>
    </main>
  );
  const output = renderJsxToString(vnode, {mode: 'pretty'});
  expect(output).toBe(`<main>
<section>
<ul>
<li>one</li>
<li>two</li>
</ul>
</section>
</main>
`);
});

test('pretty mode: inline wrapper around a block child propagates the break', () => {
  // The <span> is inline, but it contains a block <div>. The block newline must
  // propagate through the inline wrapper so the parent <section> treats the
  // span as a block child and breaks it onto its own line.
  const vnode = (
    <section>
      <span>
        <div>boxed</div>
      </span>
    </section>
  );
  const output = renderJsxToString(vnode, {mode: 'pretty'});
  expect(output).toBe(`<section>
<span><div>boxed</div>
</span></section>
`);
});

test('pretty mode: textarea newline value triggers parent block break', () => {
  const vnode = (
    <div>
      <textarea defaultValue={'line1\nline2'} />
    </div>
  );
  const output = renderJsxToString(vnode, {mode: 'pretty'});
  expect(output).toBe(`<div>
<textarea>line1
line2</textarea></div>
`);
});

test('pretty mode: dangerouslySetInnerHTML newline triggers parent block break', () => {
  const vnode = (
    <div>
      <span dangerouslySetInnerHTML={{__html: 'a\nb'}} />
    </div>
  );
  const output = renderJsxToString(vnode, {mode: 'pretty'});
  expect(output).toBe(`<div>
<span>a
b</span></div>
`);
});

test('pretty mode: components are transparent to block-break detection', () => {
  function Card(props: {children?: any}) {
    return <article>{props.children}</article>;
  }
  const vnode = (
    <section>
      <Card>
        <p>hi</p>
      </Card>
    </section>
  );
  const output = renderJsxToString(vnode, {mode: 'pretty'});
  expect(output).toBe(`<section>
<article>
<p>hi</p>
</article>
</section>
`);
});
