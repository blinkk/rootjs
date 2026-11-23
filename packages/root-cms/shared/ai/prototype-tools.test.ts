import {describe, expect, test, vi} from 'vitest';
import {
  computeSectionFramePosition,
  type PrototypeAnnotation,
  type PrototypeBoard,
  type PrototypeCommentThread,
  type PrototypeComponentSpec,
  type PrototypeFrame,
  type PrototypeProjectContext,
  SECTION_LABEL_GAP,
  SECTION_ROW_GAP,
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

describe('computeSectionFramePosition', () => {
  const label = (text: string, x: number, y: number) => ({
    id: `label_${text}`,
    pageId: 'explorations',
    kind: 'label' as const,
    text,
    x,
    y,
  });

  test('appends to the right of an existing section', () => {
    const frames = [
      makeFrame({id: 'a', x: 80, y: 176}),
      makeFrame({id: 'b', x: 1600, y: 176}),
      makeFrame({id: 'c', x: 9000, y: 2000}),
    ];
    const labels = [label('Round 1', 80, 80), label('Round 2', 80, 1904)];
    expect(
      computeSectionFramePosition(frames, labels, 'explorations', ' round 1 ')
    ).toEqual({
      x: 1600 + 1440 + FRAME_AUTO_LAYOUT_GAP,
      y: 80 + SECTION_LABEL_GAP,
      createLabels: [],
    });
  });

  test('puts a new section below the tallest frame using cachedHeight', () => {
    const frames = [
      makeFrame({id: 'a', x: 80, y: 176, cachedHeight: 900}),
      makeFrame({id: 'b', x: 1600, y: 176, cachedHeight: 3000}),
    ];
    const labelY = 176 + 3000 + SECTION_ROW_GAP;
    expect(
      computeSectionFramePosition(
        frames,
        [label('Round 1', 80, 80)],
        'explorations',
        'Round 2'
      )
    ).toEqual({
      x: 80,
      y: labelY + SECTION_LABEL_GAP,
      createLabels: [{text: 'Round 2', x: 80, y: labelY}],
    });
  });

  test('also labels earlier work "Round 1" on an unlabeled page', () => {
    const frames = [makeFrame({id: 'a', x: 80, y: 80, cachedHeight: 900})];
    const result = computeSectionFramePosition(
      frames,
      [],
      'explorations',
      'Round 2'
    );
    expect(result.createLabels).toEqual([
      {text: 'Round 1', x: 80, y: 80 - SECTION_LABEL_GAP},
      {text: 'Round 2', x: 80, y: 80 + 900 + SECTION_ROW_GAP},
    ]);
    expect(
      computeSectionFramePosition(frames, [], 'explorations', 'Round 1')
        .createLabels
    ).toHaveLength(1);
  });

  test('parallel frame_create calls for a new section share one label', async () => {
    const base = makeTestBackend({
      frames: [makeFrame({id: 'a', x: 80, y: 80, cachedHeight: 900})],
    });
    const annotations: PrototypeAnnotation[] = [];
    const tools = createPrototypeAiTools({
      ...base.backend,
      getState: () => ({...base.backend.getState(), annotations}),
      saveAnnotation: async (input) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        const saved = {
          ...input,
          createdAt: 1,
          createdBy: '',
          updatedAt: 1,
          updatedBy: '',
        } as PrototypeAnnotation;
        annotations.push(saved);
        return saved;
      },
    });
    const ctx = {toolCallId: 'tc_section', messages: []};
    const create = (title: string) =>
      (tools.frame_create as any).execute(
        {title, section: 'Round 2', blocks: []},
        ctx
      );
    const [resA, resB] = await Promise.all([create('A'), create('B')]);

    const rowY = 80 + 900 + SECTION_ROW_GAP + SECTION_LABEL_GAP;
    expect([resA.frame.x, resB.frame.x]).toEqual([
      80,
      80 + 1440 + FRAME_AUTO_LAYOUT_GAP,
    ]);
    expect([resA.frame.y, resB.frame.y]).toEqual([rowY, rowY]);
    expect(annotations.map((item) => item.text).sort()).toEqual([
      'Round 1',
      'Round 2',
    ]);

    const overview = await (tools.board_overview as any).execute({}, ctx);
    expect(overview.pages[0].sections.map((s: any) => s.frameIds)).toEqual([
      ['a'],
      [resA.frame.id, resB.frame.id],
    ]);
    const bad = await (tools.frame_create as any).execute(
      {title: 'C', pageId: 'nope', blocks: []},
      ctx
    );
    expect(bad.error).toContain('does not exist');
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

describe('createPrototypeAiTools', () => {
  test('executes board, component, frame, and comment tools end-to-end', async () => {
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
  });

  test('places parallel frame_create calls side-by-side without stacking when network saves overlap', async () => {
    const base = makeTestBackend({frames: []});
    const savedFrames: PrototypeFrame[] = [];

    // Simulate async network latency where `getState().frames` lags behind
    // until all concurrent `saveFrame` calls finish.
    const slowBackend: PrototypeToolBackend = {
      ...base.backend,
      getState: () => ({
        ...base.backend.getState(),
        frames: [...savedFrames],
      }),
      saveFrame: async (input) => {
        await new Promise((resolve) => setTimeout(resolve, 25));
        const saved = await base.backend.saveFrame(input);
        savedFrames.push(saved);
        return saved;
      },
    };

    const tools = createPrototypeAiTools(slowBackend);
    const ctx = {toolCallId: 'tc_parallel', messages: []};

    const [resA, resB, resC] = await Promise.all([
      (tools.frame_create as any).execute(
        {
          title: 'Variant A',
          width: 1440,
          blocks: [
            {component: 'TemplateHero', label: 'Hero', html: '<h1>A</h1>'},
          ],
        },
        ctx
      ),
      (tools.frame_create as any).execute(
        {
          title: 'Variant B',
          width: 1440,
          blocks: [
            {component: 'TemplateHero', label: 'Hero', html: '<h1>B</h1>'},
          ],
        },
        ctx
      ),
      (tools.frame_create as any).execute(
        {
          title: 'Variant C',
          width: 1440,
          blocks: [
            {component: 'TemplateHero', label: 'Hero', html: '<h1>C</h1>'},
          ],
        },
        ctx
      ),
    ]);

    expect([resA.frame.x, resB.frame.x, resC.frame.x]).toEqual([
      80,
      80 + 1440 + FRAME_AUTO_LAYOUT_GAP,
      80 + 2 * (1440 + FRAME_AUTO_LAYOUT_GAP),
    ]);
    expect([resA.frame.y, resB.frame.y, resC.frame.y]).toEqual([80, 80, 80]);
  });
});
