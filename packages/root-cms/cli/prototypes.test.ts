// @vitest-environment node
/**
 * Unit and Firestore emulator integration tests for `root-cms prototypes.*`
 * CLI handlers (`packages/root-cms/cli/prototypes.ts`).
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {RootConfig} from '@blinkk/root';
import {type App, deleteApp, initializeApp} from 'firebase-admin/app';
import {type Firestore, getFirestore} from 'firebase-admin/firestore';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type {
  PrototypeCommentThread,
  PrototypeFrame,
} from '../shared/prototypes.js';
import {
  parseHtmlIntoBlocks,
  prototypesComments,
  prototypesCreate,
  prototypesDelete,
  prototypesFrameDelete,
  prototypesFrameSet,
  prototypesGet,
  prototypesList,
  prototypesUpdate,
  serializeFrameBlocksToHtml,
} from './prototypes.js';

describe('parseHtmlIntoBlocks and serializeFrameBlocksToHtml', () => {
  it('round-trips multi-section @block HTML and sanitizes unsafe markup and CSS', () => {
    const rawHtml = `
<!-- @block key="header" component="GlobalHeader" label="Global header" -->
<header class="border-b px-8 py-4" onclick="evil()"><script>bad()</script><nav>Acme</nav></header>

<!-- @block key="matrix" component="PricingMatrix" label="Pricing &quot;Pro&quot; matrix" proposed="true" -->
<section class="py-16"><h2>Plans</h2></section>
`;
    const blocks = parseHtmlIntoBlocks(rawHtml, {
      css: '.hero { min-height: 100vh; } @import url("https://evil.example/a.css");',
    });

    expect(blocks._array).toEqual(['header', 'matrix']);
    const header = blocks.header;
    const matrix = blocks.matrix;
    if (!header || Array.isArray(header) || !matrix || Array.isArray(matrix)) {
      throw new Error('Expected parsed blocks');
    }
    expect(header.component).toBe('GlobalHeader');
    expect(header.html).not.toContain('<script');
    expect(header.html).not.toContain('onclick');
    expect(header.css).toContain('--proto-vh');
    expect(header.css).not.toContain('@import');

    expect(matrix.component).toBe('PricingMatrix');
    expect(matrix.label).toBe('Pricing "Pro" matrix');
    expect(matrix.proposed).toBe(true);

    const fakeFrame: PrototypeFrame = {
      id: 'variant-a',
      boardId: 'pricing',
      pageId: 'page-1',
      title: 'Variant A',
      width: 1440,
      x: 80,
      y: 80,
      blocks,
      createdAt: 1,
      createdBy: 'dev@example.com',
      updatedAt: 1,
      updatedBy: 'dev@example.com',
    };

    const serialized = serializeFrameBlocksToHtml(fakeFrame);
    const reparsed = parseHtmlIntoBlocks(serialized);
    expect(reparsed._array).toEqual(['header', 'matrix']);
    const reparsedMatrix = reparsed.matrix;
    if (!reparsedMatrix || Array.isArray(reparsedMatrix)) {
      throw new Error('Expected reparsed matrix block');
    }
    expect(reparsedMatrix.label).toBe('Pricing "Pro" matrix');
    expect(reparsedMatrix.proposed).toBe(true);
    expect(reparsedMatrix.html).toBe(
      '<section class="py-16"><h2>Plans</h2></section>'
    );
  });
});

describe('prototypes.* CLI integration', () => {
  let app: App;
  let db: Firestore;
  let tmpRootDir: string;
  let projectId: string;
  let rootConfig: RootConfig;
  let seq = 0;

  beforeAll(async () => {
    app = initializeApp(
      {projectId: 'demo-prototypes-cli'},
      'prototypes-cli-test'
    );
    db = getFirestore(app);
    tmpRootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'root-proto-cli-'));
    await fs.mkdir(path.join(tmpRootDir, 'styles'), {recursive: true});
    await fs.writeFile(
      path.join(tmpRootDir, 'styles/tokens.css'),
      ':root { --color-primary: #15803d; --color-bg: #fafaf9; --font-sans: Inter, sans-serif; }\n',
      'utf8'
    );
  });

  afterAll(async () => {
    await deleteApp(app);
    await fs.rm(tmpRootDir, {recursive: true, force: true});
  });

  beforeEach(async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    projectId = `cli-proto-proj-${++seq}`;
    const currentProjectId = projectId;
    const cmsPluginStub = {
      name: 'root-cms',
      getConfig: () => ({id: currentProjectId, name: 'CLI Test Project'}),
      getFirebaseApp: () => app,
      getFirestore: () => db,
    };
    rootConfig = {
      rootDir: tmpRootDir,
      plugins: [cmsPluginStub],
    } as unknown as RootConfig;
  });

  it('creates boards, uploads side-by-side HTML/JSON frames, exports files, and resolves comments', async () => {
    const baseOpts = {
      rootConfig,
      modifiedBy: 'agent@example.com',
      json: true,
    };

    // 1. Create a board and verify default Page 1 + extracted theme tokens.
    const board = await prototypesCreate('pricing-refresh', {
      ...baseOpts,
      title: 'Pricing page refresh',
      description: 'Three-tier comparison options',
    });
    expect(board.id).toBe('pricing-refresh');
    expect(board.pages).toEqual([{id: 'page-1', name: 'Page 1'}]);
    expect(board.theme.colorPrimary).toBe('#15803d');

    // 2. Upload Variant A from an @block-segmented .html file and Variant B from a .json file.
    const variantAPath = path.join(tmpRootDir, 'variant-a.html');
    await fs.writeFile(
      variantAPath,
      [
        '<!-- @block key="hero" component="Hero" label="Pricing hero" -->',
        '<section class="py-20"><h1>Simple pricing</h1></section>',
        '<!-- @block key="tiers" component="PricingTiers" label="Pricing tiers" proposed="true" -->',
        '<section class="grid grid-cols-3 gap-6"><div>Pro</div></section>',
      ].join('\n'),
      'utf8'
    );
    const frameA = await prototypesFrameSet(
      'pricing-refresh',
      'variant-a',
      variantAPath,
      {
        ...baseOpts,
        title: 'Variant A',
        width: '1440',
      }
    );
    expect(frameA.x).toBe(80);
    expect(frameA.y).toBe(80);
    expect(frameA.blocks._array).toEqual(['hero', 'tiers']);

    const variantBPath = path.join(tmpRootDir, 'variant-b.json');
    await fs.writeFile(
      variantBPath,
      JSON.stringify({
        title: 'Variant B',
        width: 1440,
        blocks: [
          {
            key: 'hero',
            component: 'Hero',
            label: 'Compact hero',
            html: '<section class="py-12"><h1>Compare plans</h1></section>',
          },
        ],
      }),
      'utf8'
    );
    const frameB = await prototypesFrameSet(
      'pricing-refresh',
      'variant-b',
      variantBPath,
      baseOpts
    );
    // Auto-positioned to the right of Variant A (80 + 1440 + 80 = 1600).
    expect(frameB.x).toBe(1600);
    expect(frameB.y).toBe(80);

    // 3. Add a page and rename Page 1 via `prototypes.update`.
    const updatedBoard = await prototypesUpdate('pricing-refresh', {
      ...baseOpts,
      renamePage: 'page-1:Desktop',
      addPage: 'Mobile',
    });
    expect(updatedBoard.pages).toEqual([
      {id: 'page-1', name: 'Desktop'},
      {id: 'mobile', name: 'Mobile'},
    ]);

    // 4. Seed a reviewer comment thread in Firestore, read it, and resolve it via CLI.
    const commentThread: PrototypeCommentThread = {
      id: 'thread-1',
      boardId: 'pricing-refresh',
      status: 'open',
      anchor: {
        pageId: 'page-1',
        frameId: 'variant-a',
        blockKey: 'tiers',
        relX: 0.5,
        relY: 0.4,
        fallbackX: 800,
        fallbackY: 300,
      },
      anchorLabel: 'Variant A › Pricing tiers',
      comments: [
        {
          id: 'c-1',
          type: 'comment',
          body: '<p>Highlight annual discount on the Pro card.</p>',
          content: 'Highlight annual discount on the Pro card.',
          createdAt: 100,
          createdBy: 'reviewer@example.com',
        },
      ],
      participants: ['reviewer@example.com'],
      createdAt: 100,
      createdBy: 'reviewer@example.com',
      updatedAt: 100,
      updatedBy: 'reviewer@example.com',
    };
    await db
      .doc(`Projects/${projectId}/Prototypes/pricing-refresh/Comments/thread-1`)
      .set(commentThread);

    const listedBoards = await prototypesList(baseOpts);
    expect(listedBoards).toHaveLength(1);
    expect(listedBoards[0].frameCount).toBe(2);
    expect(listedBoards[0].openCommentCount).toBe(1);

    const openComments = await prototypesComments('pricing-refresh', {
      ...baseOpts,
      frame: 'variant-a',
    });
    expect(openComments).toHaveLength(1);
    expect(openComments[0].id).toBe('thread-1');

    // 5. Export board to a local directory and verify `.html` + `.json` files are written.
    const exportDir = path.join(tmpRootDir, 'exported-pricing');
    const bundle = await prototypesGet('pricing-refresh', exportDir, baseOpts);
    expect(bundle.frames).toHaveLength(2);
    const exportedHtml = await fs.readFile(
      path.join(exportDir, 'frames/variant-a.html'),
      'utf8'
    );
    expect(exportedHtml).toContain('<!-- @block key="tiers"');

    // 6. Resolve the comment thread and verify open comments drops to 0.
    const resolved = await prototypesComments('pricing-refresh', {
      ...baseOpts,
      resolve: 'thread-1',
    });
    expect(resolved[0].status).toBe('resolved');
    const remainingOpen = await prototypesComments('pricing-refresh', baseOpts);
    expect(remainingOpen).toHaveLength(0);

    // 7. Delete one frame, then delete the board completely.
    await prototypesFrameDelete('pricing-refresh', 'variant-b', baseOpts);
    const afterFrameDelete = await prototypesGet(
      'pricing-refresh',
      undefined,
      baseOpts
    );
    expect(afterFrameDelete.frames).toHaveLength(1);

    await prototypesDelete('pricing-refresh', baseOpts);
    const afterBoardDelete = await prototypesList(baseOpts);
    expect(afterBoardDelete).toHaveLength(0);
  });
});
