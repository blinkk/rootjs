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

  it('supports custom from, htmlBody, and expiresAt', async () => {
    const {RootCMSClient} = await import('./client.js');
    const client = new RootCMSClient(mockRootConfig);
    const expiresAt = new Date('2026-07-21T12:00:00.000Z');

    await client.sendEmail({
      to: ['a@example.com', ' b@example.com ', ''],
      from: 'cms@example.com',
      subject: 'Test subject',
      body: 'Test body',
      htmlBody: '<p>Test body</p>',
      expiresAt: expiresAt,
    });

    const email = mockAdd.mock.calls[0][0];
    expect(email.to).toEqual(['a@example.com', 'b@example.com']);
    expect(email.from).toBe('cms@example.com');
    expect(email.htmlBody).toBe('<p>Test body</p>');
    expect(email.expiredAt.toDate()).toEqual(expiresAt);
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

  it('notifies a self-hosted email service by base url', async () => {
    const {RootCMSClient} = await import('./client.js');
    const client = new RootCMSClient(mockRootConfig);

    await client.sendEmail({
      to: 'a@example.com',
      subject: 'Test subject',
      body: 'Test body',
      emailService: 'https://services.example.com/',
    });

    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://services.example.com/_/send_emails?projectId=test-project'
    );
  });

  it('resolves even when the email service request fails', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    mockFetch.mockRejectedValue(new Error('network error'));

    const {RootCMSClient} = await import('./client.js');
    const client = new RootCMSClient(mockRootConfig);

    const emailId = await client.sendEmail({
      to: 'a@example.com',
      subject: 'Test subject',
      body: 'Test body',
      emailService: true,
    });
    expect(emailId).toBe('email-1');

    // Flush the fire-and-forget request to verify the error is handled.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(consoleError).toHaveBeenCalledWith(
      'failed to notify the email service:',
      expect.any(Error)
    );
    consoleError.mockRestore();
  });
});
