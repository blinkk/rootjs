import {expect, test} from 'vitest';

import {buildPreviewValue} from './DocEditor.js';

test('buildPreviewValue updates when item data mutates', () => {
  const data: any = {meta: {title: 'Foo'}};
  const template = '{meta.title}';
  expect(buildPreviewValue(template, data)).toBe('Foo');
  data.meta.title = 'Bar';
  expect(buildPreviewValue(template, data)).toBe('Bar');
});
