/* eslint-disable prettier/prettier */

import {createContext} from 'preact';
import {useContext} from 'preact/hooks';
import {expect, test} from 'vitest';
import {renderJsxToString} from './jsx-render.js';

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

test('skips null, undefined, and false attributes', () => {
  const vnode = <div id={undefined} class={null} hidden={false} />;
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe('<div></div>');
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

test('skips event handlers', () => {
  const vnode = (
    <button onClick={() => {}} onMouseOver={() => {}}>
      click
    </button>
  );
  const output = renderJsxToString(vnode, {mode: 'minimal'});
  expect(output).toBe('<button>click</button>');
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

test('pretty mode: custom block elements', () => {
  const vnode = (
    <div>
      <my-card>content</my-card>
      <span>inline</span>
    </div>
  );
  const output = renderJsxToString(vnode, {
    mode: 'pretty',
    blockElements: ['my-card'],
  });
  expect(output).toBe(`<div>
<my-card>content</my-card>
<span>inline</span></div>
`);
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

test('textarea: renders defaultValue as text content', () => {
  const vnode = <textarea defaultValue="hello world" />;
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
