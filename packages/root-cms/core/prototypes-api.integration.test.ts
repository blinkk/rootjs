// @vitest-environment node
/**
 * Integration tests for `/cms/api/prototypes.*` endpoints, ACL role checks,
 * HTML/CSS sanitization, and commenting.
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

    // A partial save (a drag sends only the position) keeps the stored blocks.
    const movedFrame = await callApi({
      path: '/cms/api/prototypes.frame.save',
      email: 'editor@example.com',
      body: {boardId, frame: {id: frameId, x: 400, y: 200}},
    });
    expect(movedFrame.status).toBe(200);
    expect(movedFrame.body.data.x).toBe(400);
    expect(movedFrame.body.data.title).toBe('Pricing B');
    expect(movedFrame.body.data.blocks._array).toEqual(['hero']);

    // A partial save for a frame that no longer exists must not recreate it.
    const ghostFrame = await callApi({
      path: '/cms/api/prototypes.frame.save',
      email: 'editor@example.com',
      body: {boardId, frame: {id: 'deleted-frame', x: 10, y: 10}},
    });
    expect(ghostFrame.status).toBe(404);

    // Read-only roles get neither project source excerpts nor model
    // credentials.
    for (const path of [
      '/cms/api/prototypes.context',
      '/cms/api/prototypes.ai.prepare',
    ]) {
      const viewerCall = await callApi({
        path,
        email: 'viewer@example.com',
        body: {boardId},
      });
      expect(viewerCall.status).toBe(403);
    }

    // Annotations: create, partial move, VIEWER forbidden, delete.
    const annotationPath = '/cms/api/prototypes.annotation.save';
    const savedNote = await callApi({
      path: annotationPath,
      email: 'editor@example.com',
      body: {
        boardId,
        annotation: {
          id: 'note-1',
          pageId: 'explorations',
          kind: 'note',
          text: '  <b>Ship</b> this  ',
          x: 10.4,
          y: 20,
        },
      },
    });
    expect(savedNote.status).toBe(200);
    expect(savedNote.body.data).toMatchObject({
      text: '<b>Ship</b> this',
      x: 10,
    });
    const movedNote = await callApi({
      path: annotationPath,
      email: 'editor@example.com',
      body: {boardId, annotation: {id: 'note-1', x: 300, y: 40}},
    });
    expect(movedNote.body.data).toMatchObject({
      x: 300,
      kind: 'note',
      text: '<b>Ship</b> this',
    });
    const ghostNote = await callApi({
      path: annotationPath,
      email: 'editor@example.com',
      body: {boardId, annotation: {id: 'gone', x: 1, y: 1}},
    });
    expect(ghostNote.status).toBe(404);
    const viewerNote = await callApi({
      path: annotationPath,
      email: 'viewer@example.com',
      body: {boardId, annotation: {id: 'note-1', x: 0, y: 0}},
    });
    expect(viewerNote.status).toBe(403);
    const withNote = await callApi({
      path: '/cms/api/prototypes.get',
      email: 'viewer@example.com',
      body: {boardId},
    });
    expect(withNote.body.data.annotations).toHaveLength(1);
    const deletedNote = await callApi({
      path: '/cms/api/prototypes.annotation.delete',
      email: 'editor@example.com',
      body: {boardId, annotationId: 'note-1'},
    });
    expect(deletedNote.status).toBe(200);
    const withoutNote = await callApi({
      path: '/cms/api/prototypes.get',
      email: 'editor@example.com',
      body: {boardId},
    });
    expect(withoutNote.body.data.annotations).toEqual([]);

    // Simultaneous replies to one thread are both kept.
    const raceThread = await callApi({
      path: '/cms/api/prototypes.comment.add',
      email: 'editor@example.com',
      body: {
        boardId,
        anchor: {
          pageId: 'explorations',
          frameId: null,
          fallbackX: 0,
          fallbackY: 0,
        },
        content: 'Root',
      },
    });
    const raceThreadId = raceThread.body.data.id as string;
    const raceReplies = await Promise.all(
      ['viewer@example.com', 'editor@example.com'].map((email) =>
        callApi({
          path: '/cms/api/prototypes.comment.add',
          email,
          body: {boardId, threadId: raceThreadId, content: `Reply by ${email}`},
        })
      )
    );
    expect(raceReplies.map((reply) => reply.status)).toEqual([200, 200]);
    expect(
      Math.max(...raceReplies.map((reply) => reply.body.data.comments.length))
    ).toBe(3);
    const raceCleanup = await callApi({
      path: '/cms/api/prototypes.comment.delete',
      email: 'editor@example.com',
      body: {
        boardId,
        threadId: raceThreadId,
        commentId: raceThread.body.data.comments[0].id,
      },
    });
    expect(raceCleanup.status).toBe(200);

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

    // VIEWER cannot move an EDITOR's comment pin, while EDITOR can move it.
    const forbiddenMove = await callApi({
      path: '/cms/api/prototypes.comment.move',
      email: 'viewer@example.com',
      body: {
        boardId,
        threadId,
        anchor: {
          pageId: 'explorations',
          frameId,
          blockKey: 'hero',
          relX: 0.75,
          relY: 0.4,
          fallbackX: 980,
          fallbackY: 240,
        },
        anchorLabel: 'Pricing B › Pricing matrix',
      },
    });
    expect(forbiddenMove.status).toBe(403);

    const movedPin = await callApi({
      path: '/cms/api/prototypes.comment.move',
      email: 'editor@example.com',
      body: {
        boardId,
        threadId,
        anchor: {
          pageId: 'explorations',
          frameId,
          blockKey: 'hero',
          relX: 0.75,
          relY: 0.4,
          fallbackX: 980,
          fallbackY: 240,
        },
        anchorLabel: 'Pricing B › Pricing matrix',
      },
    });
    expect(movedPin.status).toBe(200);
    expect(movedPin.body.data.anchor.relX).toBe(0.75);
    expect(movedPin.body.data.anchor.fallbackX).toBe(980);

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
});
