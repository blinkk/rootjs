import '../../styles/global.css';
import '../../styles/mantine.css';
import '../../styles/theme.css';
import './DocChanges.css';

import {MantineProvider} from '@mantine/core';
import {cleanup, render} from '@testing-library/preact';
import {afterEach, describe, expect, it} from 'vitest';
import {page} from 'vitest/browser';
import * as schema from '../../../core/schema.js';
import {diffDocFields} from '../../utils/doc-changes.js';
import {DocChanges} from './DocChanges.js';

const Hero = schema.define({
  name: 'Hero',
  label: 'Hero',
  preview: {title: 'Hero: {headline}'},
  fields: [
    schema.string({id: 'headline', label: 'Headline'}),
    schema.image({id: 'image', label: 'Image'}),
  ],
});

const Quote = schema.define({
  name: 'Quote',
  label: 'Quote',
  fields: [
    schema.string({id: 'quote', label: 'Quote'}),
    schema.string({id: 'author', label: 'Author'}),
  ],
});

const collection: schema.Collection = {
  id: 'Pages',
  name: 'Pages',
  fields: [
    schema.object({
      id: 'meta',
      label: 'Meta',
      fields: [
        schema.string({id: 'title', label: 'Page title'}),
        schema.string({id: 'description', label: 'Description'}),
        schema.boolean({id: 'noindex', label: 'Hide from search'}),
        schema.multiselect({
          id: 'tags',
          label: 'Tags',
          options: ['garden', 'spring', 'recipes', 'sale'],
        }),
      ],
    }),
    schema.array({
      id: 'modules',
      label: 'Modules',
      of: schema.oneOf({types: [Hero, Quote]}),
    }),
    schema.richtext({id: 'body', label: 'Body'}),
  ],
};

function svgImage(color: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" fill="${color}"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function richtext(...texts: string[]) {
  return {
    time: 0,
    version: '1',
    blocks: texts.map((text) => ({type: 'paragraph', data: {text}})),
  };
}

const PUBLISHED = {
  meta: {
    title: 'Spring harvest',
    description:
      'Fresh vegetables from the garden, picked every morning and delivered to your door.',
    tags: ['garden', 'spring'],
  },
  modules: {
    _array: ['a', 'b', 'c'],
    a: {
      _type: 'Hero',
      headline: 'Spring is here',
      image: {
        src: svgImage('#a5d8ff'),
        filename: 'tulips.png',
        alt: 'A field of tulips',
      },
    },
    b: {_type: 'Quote', quote: 'The best tomatoes I have ever had.'},
    c: {_type: 'Quote', quote: 'Fast delivery.', author: 'Sam'},
  },
  body: richtext(
    'Our <b>spring harvest</b> is ready.',
    'Order by Friday to get a box this weekend.'
  ),
};

const DRAFT = {
  meta: {
    title: 'Dig into the spring harvest',
    description:
      'Fresh vegetables and herbs from the garden, picked every morning and delivered to your door.',
    noindex: true,
    tags: ['garden', 'spring', 'recipes'],
  },
  modules: {
    _array: ['b', 'a', 'd'],
    a: {
      _type: 'Hero',
      headline: 'Spring is here',
      image: {
        src: svgImage('#b2f2bb'),
        filename: 'lettuce.png',
        alt: 'Rows of fresh lettuce',
      },
    },
    b: {
      _type: 'Quote',
      quote: 'The best tomatoes I have ever had.',
      author: 'Alex',
    },
    d: {_type: 'Hero', headline: 'Join the club'},
  },
  body: richtext(
    'Our <b>spring harvest</b> is finally ready.',
    'Order by Thursday to get a box this weekend.'
  ),
};

describe('DocChanges', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders field changes', async () => {
    await page.viewport(800, 1400);
    const changes = diffDocFields(collection, PUBLISHED, DRAFT);
    render(
      <MantineProvider>
        <div data-testid="wrapper" style={{width: 720, background: '#fff'}}>
          <DocChanges changes={changes} />
        </div>
      </MantineProvider>
    );
    await expect
      .element(page.getByText('Join the club', {exact: true}))
      .toBeVisible();
    await expect
      .element(page.getByTestId('wrapper'))
      .toMatchScreenshot('doc-changes.png');
  });

  it('renders an empty state', async () => {
    await page.viewport(800, 200);
    render(
      <MantineProvider>
        <div data-testid="wrapper" style={{width: 720, background: '#fff'}}>
          <DocChanges changes={[]} />
        </div>
      </MantineProvider>
    );
    await expect.element(page.getByText('No field changes.')).toBeVisible();
  });
});
