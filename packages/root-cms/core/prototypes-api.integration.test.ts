// @vitest-environment node
/**
 * Integration tests for `/cms/api/prototypes.*` endpoints, ACL role checks,
 * HTML/CSS sanitization, commenting, and AI turn snapshot rollback.
 * Requires the Firestore emulator (run via `firebase emulators:exec`).
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {Request, Response, RootConfig, Server} from '@blinkk/root';
import {type App, deleteApp, initializeApp} from 'firebase-admin/app';
import {type Firestore, getFirestore} from 'firebase-admin/firestore';
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {registerPrototypesApi} from './prototypes-api.js';

type RouteHandler = (req: Request, res: Response) => Promise<void> | void;

/** Minimal mock Response collector for invoking registered Express-style handlers. */
interface MockApiResult<T = any> {
  status: number;
  body: T;
  headers: Record<string, string>;
}

describe('registerPrototypesApi integration', () => {
  let app: App;
  let db: Firestore;
  let tmpRootDir: string;
  let projectId: string;
  let rootConfig: RootConfig;
  let handlers: Map<string, RouteHandler>;
  let testSeq = 0;

  beforeAll(async () => {
    app = initializeApp({projectId: 'demo-prototypes-api'}, 'prototypes-test');
    db = getFirestore(app);
    tmpRootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'root-proto-test-'));
    await fs.writeFile(
      path.join(tmpRootDir, 'ROOT.md'),
      '# Brand Guide\nUse editorial serif headings and crisp spacing.\n',
      'utf-8'
    );
  });

  afterAll(async () => {
    await deleteApp(app);
    await fs.rm(tmpRootDir, {recursive: true, force: true});
  });

  beforeEach(async () => {
    projectId = `proto-proj-${++testSeq}`;
    await db.doc(`Projects/${projectId}`).set({
      roles: {
        'editor@example.com': 'EDITOR',
        'viewer@example.com': 'VIEWER',
      },
    });

    const currentProjectId = projectId;
    const cmsPluginStub = {
      name: 'root-cms',
      getConfig: () => ({id: currentProjectId, name: 'Test Project'}),
      getFirebaseApp: () => app,
      getFirestore: () => db,
    };
    rootConfig = {
      rootDir: tmpRootDir,
      plugins: [cmsPluginStub],
    } as unknown as RootConfig;

    handlers = new Map<string, RouteHandler>();
    const fakeServer = {
      use: (routePath: string, handler: RouteHandler) => {
        handlers.set(routePath, handler);
      },
    } as unknown as Server;

    registerPrototypesApi(fakeServer, {
      rootConfig,
      cmsConfig: {
        id: currentProjectId,
        name: 'Test Project',
        firebaseConfig: {
          apiKey: 'fake',
          authDomain: 'fake',
          projectId: 'demo-prototypes-api',
          storageBucket: 'fake',
        },
      },
    });
  });

  /** Invokes a registered `/cms/api/prototypes.*` handler in-process. */
  async function callApi<T = any>(options: {
    path: string;
    requestPath?: string;
    method?: 'GET' | 'POST';
    email?: string | null;
    query?: Record<string, string>;
    body?: Record<string, unknown>;
  }): Promise<MockApiResult<T>> {
    const handler = handlers.get(options.path);
    if (!handler) {
      throw new Error(`Handler not registered: ${options.path}`);
    }
    const method = options.method || 'POST';
    const reqHeaders: Record<string, string> =
      method === 'POST'
        ? {'content-type': 'application/json', host: 'localhost:4007'}
        : {host: 'localhost:4007'};
    const req = {
      method,
      path: options.requestPath || '',
      originalUrl: options.requestPath
        ? `${options.path}${options.requestPath}`
        : options.path,
      query: options.query || {},
      body: options.body || {},
      user: options.email ? {email: options.email} : undefined,
      rootConfig,
      get: (name: string) => reqHeaders[name.toLowerCase()],
    } as unknown as Request;

    let statusCode = 200;
    let responseBody: any = null;
    const resHeaders: Record<string, string> = {};
    const res = {
      setHeader: (name: string, val: string) => {
        resHeaders[name.toLowerCase()] = val;
      },
      status: (code: number) => {
        statusCode = code;
        return res;
      },
      json: (payload: any) => {
        responseBody = payload;
        return res;
      },
      send: (payload: any) => {
        responseBody = payload;
        return res;
      },
    } as unknown as Response;

    await handler(req, res);
    return {status: statusCode, body: responseBody, headers: resHeaders};
  }

  it('enforces ACL roles for board mutations while allowing viewers to read and comment', async () => {
    // Unassigned users are rejected with 403.
    const deniedCreate = await callApi({
      path: '/cms/api/prototypes.create',
      email: 'stranger@example.com',
      body: {title: 'Pricing Exploration'},
    });
    expect(deniedCreate.status).toBe(403);

    // VIEWER cannot create or mutate boards.
    const viewerCreate = await callApi({
      path: '/cms/api/prototypes.create',
      email: 'viewer@example.com',
      body: {title: 'Pricing Exploration'},
    });
    expect(viewerCreate.status).toBe(403);

    // EDITOR creates the board (seeded with a single "Page 1").
    const created = await callApi({
      path: '/cms/api/prototypes.create',
      email: 'editor@example.com',
      body: {title: 'Pricing Page Refresh', description: 'Q4 pricing options'},
    });
    expect(created.status).toBe(200);
    expect(created.body.data.board.pages).toEqual([
      {id: 'page-1', name: 'Page 1'},
    ]);
    const boardId = created.body.data.board.id as string;
    expect(boardId).toContain('pricing-page-refresh');

    // EDITOR saves a frame with unsafe script/vh content that gets sanitized.
    const savedFrame = await callApi({
      path: '/cms/api/prototypes.frame.save',
      email: 'editor@example.com',
      body: {
        boardId,
        frame: {
          id: 'pricing-b',
          pageId: 'explorations',
          title: 'Pricing B',
          width: 1440,
          x: 120,
          y: 80,
          blocks: {
            _array: ['hero'],
            hero: {
              component: 'PricingMatrix',
              label: 'Pricing matrix',
              proposed: true,
              html: '<section class="py-16" onclick="alert(1)"><script>evil()</script><h2>Plans</h2></section>',
              css: '.tier { min-height: 100vh; } @import url("https://evil.example/x.css");',
            },
          },
        },
      },
    });
    expect(savedFrame.status).toBe(200);
    const frameId = savedFrame.body.data.id as string;
    const savedHero = savedFrame.body.data.blocks.hero;
    expect(savedHero.html).not.toContain('<script');
    expect(savedHero.html).not.toContain('onclick');
    expect(savedHero.css).toContain('--proto-vh');
    expect(savedHero.css).not.toContain('@import');

    // VIEWER can read the board and add comments, and delete their own comment,
    // but cannot delete an EDITOR's comment.
    const viewerGet = await callApi({
      path: '/cms/api/prototypes.get',
      email: 'viewer@example.com',
      body: {boardId},
    });
    expect(viewerGet.status).toBe(200);
    expect(viewerGet.body.data.frames).toHaveLength(1);

    const editorComment = await callApi({
      path: '/cms/api/prototypes.comment.add',
      email: 'editor@example.com',
      body: {
        boardId,
        anchor: {
          pageId: 'explorations',
          frameId,
          blockKey: 'hero',
          relX: 0.5,
          relY: 0.2,
          fallbackX: 720,
          fallbackY: 120,
        },
        anchorLabel: 'Pricing B › Pricing matrix',
        body: '<p>Emphasize the middle Pro plan.</p>',
        content: 'Emphasize the middle Pro plan.',
      },
    });
    expect(editorComment.status).toBe(200);
    const threadId = editorComment.body.data.id as string;
    const editorCommentId = editorComment.body.data.comments[0].id as string;

    const viewerReply = await callApi({
      path: '/cms/api/prototypes.comment.add',
      email: 'viewer@example.com',
      body: {
        boardId,
        threadId,
        body: '<p>Agreed, let us highlight annual savings too.</p>',
        content: 'Agreed, let us highlight annual savings too.',
      },
    });
    expect(viewerReply.status).toBe(200);
    const viewerReplyId = viewerReply.body.data.comments[1].id as string;

    // VIEWER cannot delete EDITOR's root comment.
    const forbiddenDelete = await callApi({
      path: '/cms/api/prototypes.comment.delete',
      email: 'viewer@example.com',
      body: {boardId, threadId, commentId: editorCommentId},
    });
    expect(forbiddenDelete.status).toBe(403);

    // VIEWER can delete their own reply.
    const ownDelete = await callApi({
      path: '/cms/api/prototypes.comment.delete',
      email: 'viewer@example.com',
      body: {boardId, threadId, commentId: viewerReplyId},
    });
    expect(ownDelete.status).toBe(200);

    // VIEWER can open the full-page standalone preview, while strangers get 403.
    const viewerPreview = await callApi<string>({
      path: '/cms/prototypes-preview',
      requestPath: `/${boardId}/${frameId}`,
      method: 'GET',
      email: 'viewer@example.com',
    });
    expect(viewerPreview.status).toBe(200);
    expect(viewerPreview.headers['content-security-policy']).toContain(
      'sandbox allow-scripts;'
    );
    expect(viewerPreview.body).toContain('Pricing B · Pricing Page Refresh');
    expect(viewerPreview.body).toContain('\\u003ch2>Plans\\u003c/h2>');
    expect(viewerPreview.body).not.toContain('evil()');

    const strangerPreview = await callApi<string>({
      path: '/cms/prototypes-preview',
      requestPath: `/${boardId}/${frameId}`,
      method: 'GET',
      email: 'stranger@example.com',
    });
    expect(strangerPreview.status).toBe(403);
  });

  it('reverts and restores created and modified frames and components via prototypes.turn.revert', async () => {
    const created = await callApi({
      path: '/cms/api/prototypes.create',
      email: 'editor@example.com',
      body: {title: 'Landing Variant Test'},
    });
    const boardId = created.body.data.board.id as string;

    // Initial baseline frame A.
    const frameARes = await callApi({
      path: '/cms/api/prototypes.frame.save',
      email: 'editor@example.com',
      body: {
        boardId,
        frame: {
          id: 'frame-a',
          pageId: 'explorations',
          title: 'Frame A (Before)',
          width: 1440,
          x: 0,
          y: 0,
          blocks: {
            _array: ['b1'],
            b1: {
              component: 'Hero',
              label: 'Hero',
              html: '<section><h1>Original Headline</h1></section>',
            },
          },
        },
      },
    });
    const frameABefore = frameARes.body.data;

    // Simulate an AI turn that mutates Frame A, creates Frame B, and proposes a new component.
    const frameAAfterRes = await callApi({
      path: '/cms/api/prototypes.frame.save',
      email: 'editor@example.com',
      body: {
        boardId,
        frame: {
          ...frameABefore,
          title: 'Frame A (After AI)',
        },
      },
    });
    const frameBRes = await callApi({
      path: '/cms/api/prototypes.frame.save',
      email: 'editor@example.com',
      body: {
        boardId,
        frame: {
          id: 'frame-b',
          pageId: 'explorations',
          title: 'Frame B (AI Variant)',
          width: 1440,
          x: 1560,
          y: 0,
          blocks: {_array: []},
        },
      },
    });
    const specRes = await callApi({
      path: '/cms/api/prototypes.component.save',
      email: 'editor@example.com',
      body: {
        boardId,
        spec: {
          name: 'ComparisonTable',
          label: 'Comparison table',
          origin: 'proposed',
          defaultHtml: '<div>Table</div>',
        },
      },
    });
    expect(specRes.status).toBe(200);

    const turnSave = await callApi({
      path: '/cms/api/prototypes.turn.save',
      email: 'editor@example.com',
      body: {
        boardId,
        turn: {
          id: 'turn-1',
          boardId,
          summaryLines: [
            'Updated Frame A',
            'Created Frame B',
            'Proposed ComparisonTable',
          ],
          framesBefore: {
            'frame-a': frameABefore,
            'frame-b': null,
          },
          framesAfter: {
            'frame-a': frameAAfterRes.body.data,
            'frame-b': frameBRes.body.data,
          },
          componentsBefore: {
            ComparisonTable: null,
          },
          componentsAfter: {
            ComparisonTable: specRes.body.data,
          },
        },
      },
    });
    expect(turnSave.status).toBe(200);

    // Revert the AI turn and verify Frame A is restored, Frame B is deleted, and ComparisonTable is removed.
    const reverted = await callApi({
      path: '/cms/api/prototypes.turn.revert',
      email: 'editor@example.com',
      body: {boardId, turnId: 'turn-1'},
    });
    expect(reverted.status).toBe(200);
    expect(reverted.body.data.reverted).toBe(true);

    const bundleAfterRevert = await callApi({
      path: '/cms/api/prototypes.get',
      email: 'editor@example.com',
      body: {boardId},
    });
    expect(bundleAfterRevert.status).toBe(200);
    expect(bundleAfterRevert.body.data.frames).toHaveLength(1);
    expect(bundleAfterRevert.body.data.frames[0].id).toBe('frame-a');
    expect(bundleAfterRevert.body.data.frames[0].title).toBe(
      'Frame A (Before)'
    );
    expect(
      bundleAfterRevert.body.data.components.ComparisonTable
    ).toBeUndefined();

    // Redo (`restore: true`) re-applies Frame B and ComparisonTable cleanly.
    const restored = await callApi({
      path: '/cms/api/prototypes.turn.revert',
      email: 'editor@example.com',
      body: {boardId, turnId: 'turn-1', restore: true},
    });
    expect(restored.status).toBe(200);
    expect(restored.body.data.reverted).toBe(false);

    const bundleAfterRestore = await callApi({
      path: '/cms/api/prototypes.get',
      email: 'editor@example.com',
      body: {boardId},
    });
    expect(bundleAfterRestore.body.data.frames).toHaveLength(2);
    expect(
      bundleAfterRestore.body.data.components.ComparisonTable
    ).toBeDefined();
  });
});
