import {RootConfig} from '@blinkk/root';
import {beforeEach, describe, expect, it, vi} from 'vitest';

// Mock Firebase Admin.
vi.mock('firebase-admin/app', () => ({
  getApp: vi.fn(),
  initializeApp: vi.fn(),
  applicationDefault: vi.fn(),
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(),
  Timestamp: {
    now: vi.fn(() => ({toMillis: () => 1234567890})),
    fromDate: vi.fn((date: Date) => ({
      toMillis: () => date.getTime(),
      toDate: () => date,
    })),
  },
  FieldValue: {},
}));

// Mock project module.
vi.mock('./project.js', () => ({
  getCollectionSchema: vi.fn(),
}));

describe('RootCMSClient.sendEmail', () => {
  let mockRootConfig: RootConfig;
  let mockAdd: any;
  let mockFetch: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockAdd = vi.fn(async () => ({id: 'email-1'}));
    mockFetch = vi.fn(async () => ({status: 200, text: async () => ''}));
    vi.stubGlobal('fetch', mockFetch);

    mockRootConfig = {
      rootDir: '/test',
      plugins: [
        {
          name: 'root-cms',
          getConfig: () => ({
            id: 'test-project',
            firebaseConfig: {
              apiKey: 'test',
              authDomain: 'test',
              projectId: 'test-gcp-project',
              storageBucket: 'test',
            },
          }),
          getFirebaseApp: vi.fn(),
          getFirestore: vi.fn(() => ({
            collection: vi.fn(() => ({add: mockAdd})),
          })),
        } as any,
      ],
    } as any;
  });

  it('queues a pending email in the Emails collection', async () => {
    const {RootCMSClient} = await import('./client.js');
    const client = new RootCMSClient(mockRootConfig);

    const emailId = await client.sendEmail({
      to: 'a@example.com',
      subject: 'Test subject',
      body: 'Test body',
    });

    expect(emailId).toBe('email-1');
    expect(mockAdd).toHaveBeenCalledOnce();
    const email = mockAdd.mock.calls[0][0];
    expect(email.status).toBe('pending');
    expect(email.to).toEqual(['a@example.com']);
    expect(email.from).toBe('noreply@test-gcp-project.appspotmail.com');
    expect(email.subject).toBe('Test subject');
    expect(email.body).toBe('Test body');
    expect(email.htmlBody).toBeUndefined();
    expect(email.expiredAt).toBeUndefined();
    expect(email.createdAt).toBeDefined();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('derives a plain-text body from the html body', async () => {
    const {RootCMSClient} = await import('./client.js');
    const client = new RootCMSClient(mockRootConfig);

    await client.sendEmail({
      to: 'a@example.com',
      subject: 'Test subject',
      htmlBody: '<h2>Title</h2>\n<p>Tom &amp; Jerry<br>Second line</p>',
    });

    const email = mockAdd.mock.calls[0][0];
    expect(email.body).toBe('Title\n\nTom & Jerry\nSecond line');
  });

  it('throws when required fields are missing', async () => {
    const {RootCMSClient} = await import('./client.js');
    const client = new RootCMSClient(mockRootConfig);

    await expect(
      client.sendEmail({to: [], subject: 'Test subject'})
    ).rejects.toThrow('missing required: "to"');
    await expect(
      client.sendEmail({to: 'a@example.com', subject: ''})
    ).rejects.toThrow('missing required: "subject"');
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('notifies the default email service when emailService is true', async () => {
    const {RootCMSClient} = await import('./client.js');
    const client = new RootCMSClient(mockRootConfig);

    await client.sendEmail({
      to: 'a@example.com',
      subject: 'Test subject',
      body: 'Test body',
      emailService: true,
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://services.rootjs.dev/_/send_emails?projectId=test-project'
    );
  });
});
