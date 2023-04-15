import {expect, test} from 'vitest';

import {htmlMinify} from './html-minify';

test('minify html', async () => {
  const input = `

  <!doctype html>

    <html lang="en">
<meta charset="utf-8" />
<title>🔬 Test</title>

<body>
  <h1 class="">Hello world</h1>
  <p>Lorem ipsum
  dolor sit amet.</p>
  </body>
  </html>
  `;
  const output = await htmlMinify(input);
  expect(output).toMatchInlineSnapshot(`
    "<!doctype html>
    <html lang=\\"en\\">
    <meta charset=\\"utf-8\\">
    <title>🔬 Test</title>
    <body>
    <h1 class=\\"\\">Hello world</h1>
    <p>Lorem ipsum dolor sit amet.</p>
    </body>
    </html>
    "
  `);
});
