import {describe, expect, test, vi} from 'vitest';
import type {
  PrototypeBoard,
  PrototypeCommentThread,
  PrototypeComponentSpec,
  PrototypeFrame,
  PrototypeProjectContext,
} from '../prototypes.js';
import {
  applyFrameBlockOperations,
  buildBlockMap,
  computeNextFramePosition,
  createPrototypeAiTools,
  DEFAULT_FRAME_START_X,
  DEFAULT_FRAME_START_Y,
  FRAME_AUTO_LAYOUT_GAP,
  PROTOTYPE_AI_SKILLS,
  PrototypeTurnTracker,
  type PrototypeToolBackend,
} from './prototype-tools.js';

function makeFrame(overrides: Partial<PrototypeFrame> = {}): PrototypeFrame {
  return {
    id: overrides.id || 'frame_1',
    boardId: overrides.boardId || 'board_1',
    pageId: overrides.pageId || 'explorations',
    title: overrides.title || 'Pricing A',
    width: overrides.width ?? 1440,
    x: overrides.x ?? 80,
    y: overrides.y ?? 80,
    cachedHeight: overrides.cachedHeight ?? 900,
    blocks:
      overrides.blocks ||
      buildBlockMap([
        {
          key: 'hero_1',
          component: 'TemplateHero',
          label: 'Headline',
          html: '<section><h1>Pricing</h1></section>',
        },
        {
          key: 'grid_1',
          component: 'FeatureGrid',
          label: 'Feature grid',
          html: '<section><div>Features</div></section>',
        },
        {
          key: 'cta_1',
          component: 'CtaBand',
          label: 'CTA band',
          html: '<section><button>Start</button></section>',
        },
      ]),
    createdAt: 1000,
    createdBy: 'alice@example.com',
    updatedAt: 1000,
    updatedBy: 'alice@example.com',
  };
}

function makeBoard(): PrototypeBoard {
  return {
    id: 'board_1',
    title: 'Pricing page refresh',
    description: 'Explore 3-tier pricing layouts.',
    status: 'active',
    pages: [
      {id: 'explorations', name: 'Explorations'},
      {id: 'mobile', name: 'Mobile'},
    ],
    theme: {
      colorBg: '#ffffff',
      colorFg: '#111111',
      colorPrimary: '#000000',
    },
    createdAt: 1000,
    createdBy: 'alice@example.com',
    updatedAt: 1000,
    updatedBy: 'alice@example.com',
  };
}

function makeTestBackend(options?: {
  frames?: PrototypeFrame[];
  components?: Record<string, PrototypeComponentSpec>;
  comments?: PrototypeCommentThread[];
  tracker?: PrototypeTurnTracker;
}): {
  backend: PrototypeToolBackend;
  frames: PrototypeFrame[];
  components: Record<string, PrototypeComponentSpec>;
  getProjectContext: ReturnType<typeof vi.fn>;
} {
  const board = makeBoard();
  const frames = [...(options?.frames || [])];
  const components: Record<string, PrototypeComponentSpec> = {
    ...(options?.components || {}),
  };
  const comments = [...(options?.comments || [])];
  let idCounter = 1;

  const projectContext: PrototypeProjectContext = {
    projectName: 'docs',
    defaultTheme: board.theme,
    schemas: [
      {
        name: 'TemplateHero',
        label: 'Headline',
        description: 'Top hero banner.',
        fields: [
          {id: 'title', label: 'Title', type: 'string'},
          {id: 'body', label: 'Body', type: 'richtext'},
        ],
      },
      {
        name: 'FeatureGrid',
        label: 'Feature grid',
        fields: [{id: 'items', type: 'array'}],
      },
    ],
    componentSources: {
      TemplateHero: [
        {
          path: 'templates/TemplateHero/TemplateHero.tsx',
          content: 'export function TemplateHero() { return <section />; }',
        },
      ],
    },
  };

  const getProjectContext = vi.fn(async () => projectContext);

  const backend: PrototypeToolBackend = {
    getState: () => ({
      board,
      activePageId: 'explorations',
      selectedFrameId: frames[0]?.id || null,
      selectedBlockKey: null,
      frames,
      components,
      comments,
    }),
    getProjectContext,
    saveFrame: async (input) => {
      const idx = frames.findIndex((f) => f.id === input.id);
      const saved: PrototypeFrame = {
        id: input.id,
        boardId: input.boardId || board.id,
        pageId: input.pageId || 'explorations',
        title: input.title || 'Untitled',
        width: input.width ?? 1440,
        x: input.x ?? 80,
        y: input.y ?? 80,
        cachedHeight: input.cachedHeight,
        blocks: input.blocks || {_array: []},
        createdAt: idx >= 0 ? frames[idx].createdAt : 2000,
        createdBy: 'alice@example.com',
        updatedAt: 2000,
        updatedBy: 'alice@example.com',
      };
      if (idx >= 0) {
        frames[idx] = saved;
      } else {
        frames.push(saved);
      }
      return saved;
    },
    saveComponent: async (spec) => {
      const saved: PrototypeComponentSpec = {
        ...spec,
        updatedAt: 2000,
        updatedBy: 'alice@example.com',
      };
      components[saved.name] = saved;
      return saved;
    },
    turnTracker: options?.tracker,
    generateId: (prefix) => `${prefix}_${idCounter++}`,
  };

  return {backend, frames, components, getProjectContext};
}

describe('PROTOTYPE_AI_SKILLS', () => {
  test('defines built-in prototyping skills', () => {
    const names = PROTOTYPE_AI_SKILLS.map((s) => s.name);
    expect(names).toEqual([
      'explore-variants',
      'address-comments',
      'propose-component',
    ]);
    for (const skill of PROTOTYPE_AI_SKILLS) {
      expect(skill.description).toBeTruthy();
      expect(skill.instructions.length).toBeGreaterThan(40);
    }
  });
});

describe('computeNextFramePosition', () => {
  test('returns default start coordinates on an empty page', () => {
    const pos = computeNextFramePosition([], 'explorations', 1440);
    expect(pos).toEqual({
      x: DEFAULT_FRAME_START_X,
      y: DEFAULT_FRAME_START_Y,
    });
  });

  test('spaces subsequent frames horizontally by width + 80 without overlap', () => {
    const first = makeFrame({id: 'f1', x: 80, y: 80, width: 1440});
    const secondPos = computeNextFramePosition([first], 'explorations', 1440);
    expect(secondPos).toEqual({
      x: 80 + 1440 + FRAME_AUTO_LAYOUT_GAP,
      y: 80,
    });

    const second = makeFrame({
      id: 'f2',
      x: secondPos.x,
      y: secondPos.y,
      width: 1440,
    });
    const thirdPos = computeNextFramePosition(
      [first, second],
      'explorations',
      1440
    );
    expect(thirdPos).toEqual({
      x: secondPos.x + 1440 + FRAME_AUTO_LAYOUT_GAP,
      y: 80,
    });
  });

  test('ignores frames on other pages', () => {
    const desktopFrame = makeFrame({
      id: 'f1',
      pageId: 'explorations',
      x: 80,
      y: 80,
      width: 1440,
    });
    const mobilePos = computeNextFramePosition([desktopFrame], 'mobile', 390);
    expect(mobilePos).toEqual({
      x: DEFAULT_FRAME_START_X,
      y: DEFAULT_FRAME_START_Y,
    });
  });

  test('avoids overlapping existing neighbors when duplicating an anchored frame', () => {
    const first = makeFrame({id: 'f1', x: 80, y: 80, width: 1440});
    const second = makeFrame({id: 'f2', x: 1600, y: 80, width: 1440});
    // Duplicating `first` cannot land at x=1600 because `second` occupies it.
    const dupPos = computeNextFramePosition(
      [first, second],
      'explorations',
      1440,
      first
    );
    expect(dupPos).toEqual({
      x: 1600 + 1440 + FRAME_AUTO_LAYOUT_GAP,
      y: 80,
    });
  });
});

describe('applyFrameBlockOperations', () => {
  test('supports insert (append, index, beforeBlockKey, afterBlockKey)', () => {
    const initial = makeFrame().blocks;
    const result = applyFrameBlockOperations(initial, [
      {
        op: 'insert',
        beforeBlockKey: 'cta_1',
        block: {
          key: 'pricing_1',
          component: 'PricingMatrix',
          label: 'Pricing matrix',
          proposed: true,
          html: '<section>Pricing tiers</section>',
        },
      },
      {
        op: 'insert',
        index: 0,
        block: {
          key: 'nav_1',
          component: 'SiteNav',
          label: 'Navigation',
          html: '<nav>Nav</nav>',
        },
      },
      {
        op: 'insert',
        afterBlockKey: 'cta_1',
        block: {
          key: 'footer_1',
          component: 'SiteFooter',
          label: 'Footer',
          html: '<footer>Footer</footer>',
        },
      },
    ]);

    expect(result.ok).toBe(true);
    expect(result.blocks._array).toEqual([
      'nav_1',
      'hero_1',
      'grid_1',
      'pricing_1',
      'cta_1',
      'footer_1',
    ]);
    expect(result.proposedLabels).toEqual(['Pricing matrix']);
    expect(result.reusedLabels).toEqual(['Navigation', 'Footer']);
  });

  test('supports update, remove, and reorder (by order array and by toIndex)', () => {
    const initial = makeFrame().blocks;
    const updated = applyFrameBlockOperations(initial, [
      {
        op: 'update',
        blockKey: 'hero_1',
        label: 'Hero v2',
        html: '<section><h1>Updated Pricing</h1></section>',
      },
      {
        op: 'remove',
        blockKey: 'grid_1',
      },
      {
        op: 'reorder',
        blockKey: 'cta_1',
        toIndex: 0,
      },
    ]);

    expect(updated.ok).toBe(true);
    expect(updated.blocks._array).toEqual(['cta_1', 'hero_1']);
    expect(updated.blocks['grid_1']).toBeUndefined();
    expect((updated.blocks['hero_1'] as any).label).toBe('Hero v2');
    expect((updated.blocks['hero_1'] as any).component).toBe('TemplateHero');

    const reordered = applyFrameBlockOperations(updated.blocks, [
      {op: 'reorder', order: ['hero_1', 'cta_1']},
    ]);
    expect(reordered.ok).toBe(true);
    expect(reordered.blocks._array).toEqual(['hero_1', 'cta_1']);
  });

  test('returns error without crashing when targeting a nonexistent block key', () => {
    const initial = makeFrame().blocks;
    const result = applyFrameBlockOperations(initial, [
      {op: 'update', blockKey: 'missing_key', label: 'Oops'},
    ]);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('missing_key');
  });
});

describe('PrototypeTurnTracker', () => {
  test('generates concise summary lines and preserves atomic before/after snapshots', () => {
    const tracker = new PrototypeTurnTracker();
    expect(tracker.hasMutations()).toBe(false);
    expect(tracker.buildSnapshot('turn_1', 'board_1')).toBeNull();

    const spec: PrototypeComponentSpec = {
      name: 'PricingMatrix',
      label: 'Pricing matrix',
      origin: 'proposed',
      rationale: 'Three-tier comparison table not in existing schemas.',
      defaultHtml: '<section>3 tiers</section>',
      updatedAt: 2000,
      updatedBy: 'alice@example.com',
    };
    tracker.recordComponentSave(null, spec);

    const frameB = makeFrame({
      id: 'frame_b',
      title: 'Pricing B',
      blocks: buildBlockMap([
        {
          key: 'h1',
          component: 'TemplateHero',
          label: 'Headline',
          html: '<section>Hero</section>',
        },
        {
          key: 'p1',
          component: 'PricingMatrix',
          label: 'Pricing matrix',
          proposed: true,
          html: '<section>3 tiers</section>',
        },
        {
          key: 'g1',
          component: 'FeatureGrid',
          label: 'Feature grid',
          html: '<section>Grid</section>',
        },
        {
          key: 'c1',
          component: 'CtaBand',
          label: 'CTA band',
          html: '<section>CTA</section>',
        },
      ]),
    });
    tracker.recordFrameCreate(frameB);

    // Editing a frame created in the same turn must keep `framesBefore[id] = null`.
    const frameBEdited = {...frameB, title: 'Pricing B'};
    tracker.recordFrameEdit(frameB, frameBEdited);

    const snapshot = tracker.buildSnapshot('turn_1', 'board_1');
    expect(snapshot).not.toBeNull();
    expect(snapshot!.framesBefore['frame_b']).toBeNull();
    expect(snapshot!.framesAfter['frame_b']?.title).toBe('Pricing B');
    expect(snapshot!.componentsBefore?.['PricingMatrix']).toBeNull();
    expect(snapshot!.componentsAfter?.['PricingMatrix']?.origin).toBe(
      'proposed'
    );
    expect(snapshot!.summaryLines).toEqual([
      'Created frame Pricing B',
      'Proposed component Pricing matrix',
      'Reused Headline, Feature grid, CTA band',
    ]);
  });

  test('keeps original pre-turn frame state across multiple edits to an existing frame', () => {
    const tracker = new PrototypeTurnTracker();
    const original = makeFrame({id: 'f1', title: 'Pricing A'});
    const edit1 = {...original, title: 'Pricing A v1'};
    const edit2 = {...edit1, title: 'Pricing A v2'};

    tracker.recordFrameEdit(original, edit1);
    tracker.recordFrameEdit(edit1, edit2);

    const snapshot = tracker.buildSnapshot('turn_2', 'board_1');
    expect(snapshot!.framesBefore['f1']?.title).toBe('Pricing A');
    expect(snapshot!.framesAfter['f1']?.title).toBe('Pricing A v2');
    expect(snapshot!.summaryLines).toEqual(['Updated frame Pricing A v2']);
  });
});

describe('createPrototypeAiTools', () => {
  test('executes board, component, frame, and comment tools end-to-end', async () => {
    const tracker = new PrototypeTurnTracker();
    const frameA = makeFrame({id: 'frame_a', title: 'Pricing A', x: 80, y: 80});
    const openComment: PrototypeCommentThread = {
      id: 'thread_1',
      boardId: 'board_1',
      anchor: {
        pageId: 'explorations',
        frameId: 'frame_a',
        blockKey: 'grid_1',
        relX: 0.5,
        relY: 0.2,
        fallbackX: 100,
        fallbackY: 200,
      },
      anchorLabel: 'Pricing A › Feature grid',
      status: 'open',
      comments: [
        {
          id: 'c1',
          type: 'comment',
          content: 'Highlight the Pro tier more clearly.',
          createdAt: 1500,
          createdBy: 'bob@example.com',
        },
      ],
      participants: ['bob@example.com'],
      createdAt: 1500,
      createdBy: 'bob@example.com',
      updatedAt: 1500,
      updatedBy: 'bob@example.com',
    };

    const {backend, frames, getProjectContext} = makeTestBackend({
      frames: [frameA],
      comments: [openComment],
      tracker,
    });
    const tools = createPrototypeAiTools(backend);
    const ctx = {toolCallId: 'tc_1', messages: []};

    const overview = await (tools.board_overview as any).execute({}, ctx);
    expect(overview.totalOpenComments).toBe(1);
    expect(overview.pages[0].frames[0].title).toBe('Pricing A');

    const compList = await (tools.components_list as any).execute({}, ctx);
    expect(compList.existingSchemas).toHaveLength(2);

    const inspected = await (tools.component_inspect as any).execute(
      {names: ['TemplateHero']},
      ctx
    );
    expect(getProjectContext).toHaveBeenCalledWith({
      componentNames: ['TemplateHero'],
    });
    expect(inspected.components[0].sources).toHaveLength(1);

    await (tools.component_save_spec as any).execute(
      {
        name: 'PricingMatrix',
        label: 'Pricing matrix',
        origin: 'proposed',
        rationale: 'Supports 3-tier toggle comparison.',
        defaultHtml: '<section>3-tier table</section>',
      },
      ctx
    );

    const dup = await (tools.frame_duplicate as any).execute(
      {
        sourceFrameId: 'frame_a',
        title: 'Pricing B',
      },
      ctx
    );
    expect(dup.duplicated).toBe(true);
    expect(dup.frame.x).toBe(80 + 1440 + FRAME_AUTO_LAYOUT_GAP);

    const edit = await (tools.frame_edit as any).execute(
      {
        frameId: dup.frame.id,
        operations: [
          {
            op: 'insert',
            beforeBlockKey: 'cta_1',
            block: {
              component: 'PricingMatrix',
              label: 'Pricing matrix',
              proposed: true,
            },
          },
        ],
      },
      ctx
    );
    expect(edit.updated).toBe(true);
    expect(edit.frame.blocks.map((b: any) => b.component)).toEqual([
      'TemplateHero',
      'FeatureGrid',
      'PricingMatrix',
      'CtaBand',
    ]);
    expect(frames).toHaveLength(2);

    const comments = await (tools.frame_comments_list as any).execute(
      {frameId: 'frame_a'},
      ctx
    );
    expect(comments.count).toBe(1);
    expect(comments.comments[0].text).toBe(
      'Highlight the Pro tier more clearly.'
    );

    const snapshot = tracker.buildSnapshot('turn_99', 'board_1');
    expect(snapshot!.summaryLines).toEqual([
      'Created frame Pricing B',
      'Proposed component Pricing matrix',
      'Reused Headline, Feature grid, CTA band',
    ]);
  });
});
