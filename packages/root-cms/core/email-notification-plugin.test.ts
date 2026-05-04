import {RootConfig} from '@blinkk/root';
import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('firebase-admin/app', () => ({
  getApp: vi.fn(),
  initializeApp: vi.fn(),
  applicationDefault: vi.fn(),
}));

vi.mock('firebase-admin/firestore', () => {
  const Timestamp = {
    now: () => ({
      toMillis: () => 1700000000000,
      toDate: () => new Date(1700000000000),
    }),
    fromMillis: (millis: number) => ({
      toMillis: () => millis,
      toDate: () => new Date(millis),
    }),
    fromDate: (date: Date) => ({
      toMillis: () => date.getTime(),
      toDate: () => date,
    }),
  };
  return {
    getFirestore: vi.fn(),
    Timestamp,
    FieldValue: {},
  };
});

vi.mock('./project.js', () => ({
  getCollectionSchema: vi.fn(),
}));

function createMockFirestore(initial: Record<string, any> = {}) {
  const sentDocs: any[] = [];
  const docs = new Map<string, any>(Object.entries(initial));
  const db: any = {
    collection: vi.fn((path: string) => {
      let counter = 0;
      return {
        doc: (id?: string) => {
          counter += 1;
          const docId = id || `mock-doc-${counter}`;
          const fullPath = `${path}/${docId}`;
          return {
            id: docId,
            set: vi.fn(async (data: any) => {
              sentDocs.push({path: fullPath, data});
              docs.set(fullPath, data);
            }),
            get: vi.fn(async () => ({
              exists: docs.has(fullPath),
              data: () => docs.get(fullPath) || {},
            })),
          };
        },
        orderBy: () => ({
          limit: () => ({
            get: vi.fn(async () => ({docs: []})),
            where: () => ({get: vi.fn(async () => ({docs: []}))}),
          }),
        }),
      };
    }),
    doc: vi.fn((path: string) => ({
      id: path.split('/').pop(),
      get: vi.fn(async () => ({
        exists: docs.has(path),
        data: () => docs.get(path),
      })),
    })),
  };
  return {db, sentDocs, docs};
}

function makeRootConfig(db: any): RootConfig {
  return {
    rootDir: '/test',
    plugins: [
      {
        name: 'root-cms',
        getConfig: () => ({
          id: 'test-project',
          firebaseConfig: {
            apiKey: 'k',
            authDomain: 'a',
            projectId: 'test-project',
            storageBucket: 's',
          },
        }),
        getFirebaseApp: () => ({}),
        getFirestore: () => db,
      } as any,
    ],
  } as any;
}

describe('RootEmailNotificationPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queues an email when an action matches the include filter', async () => {
    const {db, sentDocs} = createMockFirestore({
      'Projects/test-project': {roles: {'admin@example.com': 'ADMIN'}},
    });
    const rootConfig = makeRootConfig(db);
    const {RootCMSClient} = await import('./client.js');
    const cmsClient = new RootCMSClient(rootConfig);

    const {RootEmailNotificationPlugin} = await import(
      './email-notification-plugin.js'
    );
    const service = RootEmailNotificationPlugin({
      from: 'noreply@example.com',
      recipients: 'team@example.com',
      filter: {include: ['doc.publish']},
    });

    const {Timestamp} = await import('firebase-admin/firestore');
    const result = await service.onAction!(
      {rootConfig, cmsClient, user: {email: 'editor@example.com'}},
      {
        action: 'doc.publish',
        by: 'editor@example.com',
        timestamp: Timestamp.now(),
        metadata: {docId: 'Pages/foo'},
      }
    );

    expect(result?.status).toBe('success');
    expect(sentDocs).toHaveLength(1);
    expect(sentDocs[0].path).toMatch(/Projects\/test-project\/Emails\//);
    expect(sentDocs[0].data.to).toEqual(['team@example.com']);
    expect(sentDocs[0].data.from).toBe('noreply@example.com');
    expect(sentDocs[0].data.subject).toContain('doc.publish');
  });

  it('skips actions excluded by the filter', async () => {
    const {db, sentDocs} = createMockFirestore();
    const rootConfig = makeRootConfig(db);
    const {RootCMSClient} = await import('./client.js');
    const cmsClient = new RootCMSClient(rootConfig);

    const {RootEmailNotificationPlugin} = await import(
      './email-notification-plugin.js'
    );
    const service = RootEmailNotificationPlugin({
      from: 'noreply@example.com',
      recipients: 'team@example.com',
      filter: {exclude: ['doc.save']},
    });

    const {Timestamp} = await import('firebase-admin/firestore');
    const result = await service.onAction!(
      {rootConfig, cmsClient},
      {
        action: 'doc.save',
        timestamp: Timestamp.now(),
      }
    );

    expect(result?.status).toBe('info');
    expect(sentDocs).toHaveLength(0);
  });

  it('resolves role:ADMINS to ACL members', async () => {
    const {db, sentDocs} = createMockFirestore({
      'Projects/test-project': {
        roles: {
          'admin1@example.com': 'ADMIN',
          'admin2@example.com': 'ADMIN',
          'editor@example.com': 'EDITOR',
          '*@example.com': 'VIEWER',
        },
      },
    });
    const rootConfig = makeRootConfig(db);
    const {RootCMSClient} = await import('./client.js');
    const cmsClient = new RootCMSClient(rootConfig);

    const {RootEmailNotificationPlugin} = await import(
      './email-notification-plugin.js'
    );
    const service = RootEmailNotificationPlugin({
      from: 'noreply@example.com',
      recipients: ['role:ADMINS'],
    });

    const {Timestamp} = await import('firebase-admin/firestore');
    await service.onAction!(
      {rootConfig, cmsClient},
      {action: 'doc.publish', timestamp: Timestamp.now()}
    );

    expect(sentDocs).toHaveLength(1);
    expect(sentDocs[0].data.to).toEqual([
      'admin1@example.com',
      'admin2@example.com',
    ]);
  });

  it('excludes the actor by default', async () => {
    const {db, sentDocs} = createMockFirestore({
      'Projects/test-project': {
        roles: {
          'a@example.com': 'ADMIN',
          'b@example.com': 'ADMIN',
        },
      },
    });
    const rootConfig = makeRootConfig(db);
    const {RootCMSClient} = await import('./client.js');
    const cmsClient = new RootCMSClient(rootConfig);

    const {RootEmailNotificationPlugin} = await import(
      './email-notification-plugin.js'
    );
    const service = RootEmailNotificationPlugin({
      from: 'noreply@example.com',
      recipients: ['role:ADMINS'],
    });

    const {Timestamp} = await import('firebase-admin/firestore');
    await service.onAction!(
      {rootConfig, cmsClient},
      {
        action: 'doc.publish',
        by: 'a@example.com',
        timestamp: Timestamp.now(),
      }
    );

    expect(sentDocs[0].data.to).toEqual(['b@example.com']);
  });

  it('automatically adds task subscribers and mentions for tasks.* actions', async () => {
    const {db, sentDocs} = createMockFirestore({
      'Projects/test-project/Tasks/42': {
        id: '42',
        subscribers: ['watcher@example.com'],
        assignee: 'assignee@example.com',
        createdBy: 'creator@example.com',
      },
    });
    const rootConfig = makeRootConfig(db);
    const {RootCMSClient} = await import('./client.js');
    const cmsClient = new RootCMSClient(rootConfig);

    const {RootEmailNotificationPlugin} = await import(
      './email-notification-plugin.js'
    );
    const service = RootEmailNotificationPlugin({
      from: 'noreply@example.com',
      recipients: ['extra@example.com'],
      excludeActor: false,
    });

    const {Timestamp} = await import('firebase-admin/firestore');
    await service.onAction!(
      {rootConfig, cmsClient},
      {
        action: 'tasks.comment.add',
        timestamp: Timestamp.now(),
        metadata: {
          taskId: '42',
          mentions: ['mentioned@example.com'],
        },
      }
    );

    expect(sentDocs).toHaveLength(1);
    const to = sentDocs[0].data.to as string[];
    expect(to).toEqual(
      expect.arrayContaining([
        'extra@example.com',
        'watcher@example.com',
        'assignee@example.com',
        'creator@example.com',
        'mentioned@example.com',
      ])
    );
  });

  it('renders templates with {{interpolation}}', async () => {
    const {db, sentDocs} = createMockFirestore();
    const rootConfig = makeRootConfig(db);
    const {RootCMSClient} = await import('./client.js');
    const cmsClient = new RootCMSClient(rootConfig);

    const {RootEmailNotificationPlugin} = await import(
      './email-notification-plugin.js'
    );
    const service = RootEmailNotificationPlugin({
      from: 'noreply@example.com',
      recipients: 'team@example.com',
      templates: {
        'doc.publish': {
          subject: 'Published: {{metadata.docId}}',
          body: '{{by}} published {{metadata.docId}}.',
        },
      },
    });

    const {Timestamp} = await import('firebase-admin/firestore');
    await service.onAction!(
      {rootConfig, cmsClient},
      {
        action: 'doc.publish',
        by: 'jane@example.com',
        timestamp: Timestamp.now(),
        metadata: {docId: 'Pages/index'},
      }
    );

    expect(sentDocs[0].data.subject).toBe('Published: Pages/index');
    expect(sentDocs[0].data.body).toBe(
      'jane@example.com published Pages/index.'
    );
  });

  it('matches templates by prefix glob', async () => {
    const {db, sentDocs} = createMockFirestore();
    const rootConfig = makeRootConfig(db);
    const {RootCMSClient} = await import('./client.js');
    const cmsClient = new RootCMSClient(rootConfig);

    const {RootEmailNotificationPlugin} = await import(
      './email-notification-plugin.js'
    );
    const service = RootEmailNotificationPlugin({
      from: 'noreply@example.com',
      recipients: 'team@example.com',
      templates: {
        'tasks.*': {
          subject: 'Task update',
          body: 'Action: {{action}}',
        },
      },
    });

    const {Timestamp} = await import('firebase-admin/firestore');
    await service.onAction!(
      {rootConfig, cmsClient},
      {
        action: 'tasks.create',
        timestamp: Timestamp.now(),
        metadata: {taskId: '1'},
      }
    );

    expect(sentDocs[0].data.subject).toBe('Task update');
    expect(sentDocs[0].data.body).toBe('Action: tasks.create');
  });

  it('returns info status when no recipients resolve', async () => {
    const {db, sentDocs} = createMockFirestore({
      'Projects/test-project': {roles: {}},
    });
    const rootConfig = makeRootConfig(db);
    const {RootCMSClient} = await import('./client.js');
    const cmsClient = new RootCMSClient(rootConfig);

    const {RootEmailNotificationPlugin} = await import(
      './email-notification-plugin.js'
    );
    const service = RootEmailNotificationPlugin({
      from: 'noreply@example.com',
      recipients: ['role:ADMIN'],
    });

    const {Timestamp} = await import('firebase-admin/firestore');
    const result = await service.onAction!(
      {rootConfig, cmsClient},
      {action: 'doc.publish', timestamp: Timestamp.now()}
    );

    expect(result?.status).toBe('info');
    expect(sentDocs).toHaveLength(0);
  });

  it('throws when recipients is empty', async () => {
    const {RootEmailNotificationPlugin} = await import(
      './email-notification-plugin.js'
    );
    expect(() =>
      RootEmailNotificationPlugin({
        from: 'noreply@example.com',
        recipients: [],
      })
    ).toThrow(/recipients/);
  });

  it('throws when from is missing', async () => {
    const {RootEmailNotificationPlugin} = await import(
      './email-notification-plugin.js'
    );
    expect(() =>
      RootEmailNotificationPlugin({
        from: '',
        recipients: 'a@example.com',
      })
    ).toThrow(/from/);
  });
});

describe('EmailClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queues an email with required fields', async () => {
    const {db, sentDocs} = createMockFirestore();
    const rootConfig = makeRootConfig(db);
    const {EmailClient} = await import('./email-client.js');
    const client = new EmailClient(rootConfig);
    const result = await client.send({
      from: 'a@example.com',
      to: 'b@example.com',
      subject: 'Hi',
      body: 'Hello.',
    });
    expect(result.id).toBeTruthy();
    expect(sentDocs).toHaveLength(1);
    const data = sentDocs[0].data;
    expect(data.from).toBe('a@example.com');
    expect(data.to).toEqual(['b@example.com']);
    expect(data.status).toBe('pending');
  });

  it('dedupes recipients', async () => {
    const {db, sentDocs} = createMockFirestore();
    const rootConfig = makeRootConfig(db);
    const {EmailClient} = await import('./email-client.js');
    const client = new EmailClient(rootConfig);
    await client.send({
      from: 'a@example.com',
      to: ['b@example.com', 'B@EXAMPLE.COM', 'c@example.com'],
      subject: 'Hi',
      body: 'Hello.',
    });
    expect(sentDocs[0].data.to).toEqual(['b@example.com', 'c@example.com']);
  });

  it('throws if recipients are empty', async () => {
    const {db} = createMockFirestore();
    const rootConfig = makeRootConfig(db);
    const {EmailClient} = await import('./email-client.js');
    const client = new EmailClient(rootConfig);
    await expect(
      client.send({
        from: 'a@example.com',
        to: [],
        subject: 'Hi',
        body: 'Hello.',
      })
    ).rejects.toThrow(/recipient/);
  });
});
