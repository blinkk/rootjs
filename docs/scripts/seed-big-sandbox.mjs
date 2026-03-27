/**
 * Seed script for BigSandbox collection.
 *
 * Uploads 500 documents to the BigSandbox collection. Each document contains
 * between 20-30 blocks of various types (ButtonsBlock, CodeBlock, CopyBlock,
 * ImageBlock) with placeholder content.
 *
 * Usage:
 *   cd docs && node scripts/seed-big-sandbox.mjs
 */

import {loadRootConfig} from '@blinkk/root/node';
import {RootCMSClient} from '@blinkk/root-cms';

const TOTAL_DOCS = 1000;
const MIN_BLOCKS = 20;
const MAX_BLOCKS = 30;

const BLOCK_TYPES = ['ButtonsBlock', 'CodeBlock', 'CopyBlock', 'ImageBlock'];

const LOREM_SENTENCES = [
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
  'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
  'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.',
  'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum.',
  'Excepteur sint occaecat cupidatat non proident, sunt in culpa.',
  'Nulla facilisi morbi tempus iaculis urna id volutpat.',
  'Amet venenatis urna cursus eget nunc scelerisque viverra mauris.',
  'Vitae congue mauris rhoncus aenean vel elit scelerisque.',
  'Egestas integer eget aliquet nibh praesent tristique magna.',
  'Pellentesque habitant morbi tristique senectus et netus et malesuada.',
];

const LOREM_PARAGRAPHS = [
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
  'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
  'Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Integer feugiat scelerisque varius morbi enim nunc faucibus a pellentesque sit amet.',
  'Viverra justo nec ultrices dui sapien eget mi proin sed. Amet nisl suscipit adipiscing bibendum est ultricies integer quis auctor. Vitae congue mauris rhoncus aenean vel elit scelerisque mauris.',
];

const CODE_SAMPLES = [
  {
    language: 'ts',
    code: `import {defineConfig} from '@blinkk/root';

export default defineConfig({
  domain: 'https://example.com',
  i18n: {
    locales: ['en'],
  },
});`,
  },
  {
    language: 'tsx',
    code: `import {ComponentChildren} from 'preact';

interface Props {
  title: string;
  children?: ComponentChildren;
}

export default function Card(props: Props) {
  return (
    <div className="card">
      <h2>{props.title}</h2>
      {props.children}
    </div>
  );
}`,
  },
  {
    language: 'bash',
    code: `# Install dependencies
npm install @blinkk/root @blinkk/root-cms

# Start the dev server
npm run dev`,
  },
  {
    language: 'html',
    code: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Example Page</title>
</head>
<body>
  <h1>Hello, World!</h1>
</body>
</html>`,
  },
  {
    language: 'json',
    code: `{
  "name": "my-project",
  "version": "1.0.0",
  "scripts": {
    "dev": "root dev",
    "build": "root build"
  }
}`,
  },
];

const TITLE_WORDS = [
  'Getting',
  'Started',
  'Advanced',
  'Guide',
  'Introduction',
  'Overview',
  'Deep',
  'Dive',
  'Tutorial',
  'Building',
  'Creating',
  'Managing',
  'Performance',
  'Optimization',
  'Scaling',
  'Migration',
  'Testing',
  'Deployment',
  'Configuration',
  'Architecture',
  'Patterns',
  'Best',
  'Practices',
  'Tips',
  'Tricks',
  'Workflow',
  'Integration',
  'Setup',
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateTitle(index) {
  const word1 = randomPick(TITLE_WORDS);
  const word2 = randomPick(TITLE_WORDS);
  const word3 = randomPick(TITLE_WORDS);
  return `${word1} ${word2} ${word3} #${index + 1}`;
}

function generateSlug(index) {
  return `big-sandbox-doc-${String(index + 1).padStart(4, '0')}`;
}

function generateButtonsBlock() {
  const numButtons = randomInt(1, 3);
  const buttons = [];
  for (let i = 0; i < numButtons; i++) {
    buttons.push({
      label: `Button ${i + 1}`,
      url: `https://example.com/page-${randomInt(1, 100)}`,
    });
  }
  return {
    _type: 'ButtonsBlock',
    options: ['align:center'],
    buttons,
  };
}

function generateCodeBlock() {
  const sample = randomPick(CODE_SAMPLES);
  return {
    _type: 'CodeBlock',
    id: `code-${randomInt(1, 9999)}`,
    options: [],
    language: sample.language,
    code: sample.code,
  };
}

function generateCopyBlock() {
  return {
    _type: 'CopyBlock',
    id: `copy-${randomInt(1, 9999)}`,
    options: [],
    eyebrow: randomPick(LOREM_SENTENCES).slice(0, 30),
    title: randomPick(LOREM_SENTENCES),
    titleSize: randomPick(['h1', 'h2', 'h3', 'h4']),
    body: {
      data: [
        {type: 'paragraph', children: [{text: randomPick(LOREM_PARAGRAPHS)}]},
        {type: 'paragraph', children: [{text: randomPick(LOREM_PARAGRAPHS)}]},
      ],
    },
  };
}

function generateImageBlock() {
  const width = randomPick([800, 1200, 1600]);
  const height = randomPick([400, 600, 900]);
  return {
    _type: 'ImageBlock',
    id: `image-${randomInt(1, 9999)}`,
    options: [],
    image: {
      src: `https://picsum.photos/${width}/${height}`,
      alt: randomPick(LOREM_SENTENCES).slice(0, 50),
      width,
      height,
    },
    caption: randomPick(LOREM_SENTENCES),
  };
}

function generateBlock() {
  const type = randomPick(BLOCK_TYPES);
  switch (type) {
    case 'ButtonsBlock':
      return generateButtonsBlock();
    case 'CodeBlock':
      return generateCodeBlock();
    case 'CopyBlock':
      return generateCopyBlock();
    case 'ImageBlock':
      return generateImageBlock();
    default:
      return generateCopyBlock();
  }
}

function generateDocument(index) {
  const numBlocks = randomInt(MIN_BLOCKS, MAX_BLOCKS);
  const blocks = [];
  for (let i = 0; i < numBlocks; i++) {
    blocks.push(generateBlock());
  }

  return {
    meta: {
      title: generateTitle(index),
      description: randomPick(LOREM_PARAGRAPHS),
      image: {
        src: 'https://picsum.photos/1200/600',
        alt: `Placeholder image for doc ${index + 1}`,
        width: 1200,
        height: 600,
      },
    },
    content: {
      body: {
        data: [
          {type: 'paragraph', children: [{text: randomPick(LOREM_PARAGRAPHS)}]},
          {type: 'paragraph', children: [{text: randomPick(LOREM_PARAGRAPHS)}]},
          {type: 'paragraph', children: [{text: randomPick(LOREM_PARAGRAPHS)}]},
        ],
      },
      blocks,
    },
  };
}

async function main() {
  const rootConfig = await loadRootConfig(process.cwd());
  const client = new RootCMSClient(rootConfig);

  console.log(`Seeding ${TOTAL_DOCS} documents to BigSandbox...`);

  for (let i = 0; i < TOTAL_DOCS; i++) {
    const slug = generateSlug(i);
    const fields = generateDocument(i);
    const docId = `BigSandbox/${slug}`;
    await client.saveDraftData(docId, fields);

    if ((i + 1) % 50 === 0) {
      console.log(`  Uploaded ${i + 1}/${TOTAL_DOCS} documents`);
    }
  }

  console.log(`Done! Uploaded ${TOTAL_DOCS} documents to BigSandbox.`);
}

main();
