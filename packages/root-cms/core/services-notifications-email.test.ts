import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {Action} from './client.js';
import {
  DEFAULT_EMAIL_TEMPLATE,
  emailNotifications,
  renderEmailTemplate,
} from './services-notifications-email.js';
import type {NotificationServiceContext} from './services-notifications.js';

/** Returns a fake firestore `Timestamp`-like object for tests. */
function fakeTimestamp(date: Date) {
  return {toDate: () => date, toMillis: () => date.getTime()} as any;
}

const TEST_DATE = new Date('2026-07-21T12:00:00.000Z');

function testAction(overrides?: Partial<Action>): Action {
  return {
    action: 'doc.publish',
    by: 'user@example.com',
    timestamp: fakeTimestamp(TEST_DATE),
    metadata: {docId: 'Pages/foo'},
    ...overrides,
  };
}

function testContext() {
  const sendEmail = vi.fn(async () => 'email-id-1');
  const ctx = {
    rootConfig: {} as any,
    cmsClient: {sendEmail} as any,
    user: {email: 'user@example.com'},
  } as NotificationServiceContext;
  return {ctx, sendEmail};
}

describe('renderEmailTemplate', () => {
  it('replaces placeholders with values from data', () => {
    const result = renderEmailTemplate('{action} by {by}', {
      action: 'doc.publish',
      by: 'user@example.com',
    });
    expect(result).toBe('doc.publish by user@example.com');
  });

  it('supports dot notation for nested values', () => {
    const result = renderEmailTemplate('doc: {metadata.docId}', {
      metadata: {docId: 'Pages/foo'},
    });
    expect(result).toBe('doc: Pages/foo');
  });

  it('leaves unknown placeholders untouched', () => {
    const result = renderEmailTemplate('{action} {unknown.key}', {
      action: 'doc.publish',
    });
    expect(result).toBe('doc.publish {unknown.key}');
  });

  it('formats timestamps and dates as ISO strings', () => {
    expect(
      renderEmailTemplate('{timestamp}', {timestamp: fakeTimestamp(TEST_DATE)})
    ).toBe('2026-07-21T12:00:00.000Z');
    expect(renderEmailTemplate('{date}', {date: TEST_DATE})).toBe(
      '2026-07-21T12:00:00.000Z'
    );
  });

  it('formats objects as json', () => {
    const result = renderEmailTemplate('{metadata}', {
      metadata: {docId: 'Pages/foo'},
    });
    expect(result).toBe('{\n  "docId": "Pages/foo"\n}');
  });

  it('stringifies primitive values', () => {
    expect(renderEmailTemplate('{count}', {count: 42})).toBe('42');
    expect(renderEmailTemplate('{flag}', {flag: false})).toBe('false');
  });

  it('escapes html when the escapeHtml option is set', () => {
    const data = {title: '<b>"Tom" & Jerry\'s</b>'};
    expect(renderEmailTemplate('{title}', data, {escapeHtml: true})).toBe(
      '&lt;b&gt;&quot;Tom&quot; &amp; Jerry&#39;s&lt;/b&gt;'
    );
    expect(renderEmailTemplate('{title}', data)).toBe(data.title);
  });
});

describe('emailNotifications', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('uses default id and label', () => {
    const service = emailNotifications({to: ['a@example.com']});
    expect(service.id).toBe('email');
    expect(service.label).toBe('Email');
  });

  it('supports custom id, label, and icon', () => {
    const service = emailNotifications({
      id: 'my-email',
      label: 'My Email',
      icon: 'https://example.com/icon.png',
      to: ['a@example.com'],
    });
    expect(service.id).toBe('my-email');
    expect(service.label).toBe('My Email');
    expect(service.icon).toBe('https://example.com/icon.png');
  });

  it('queues an email using the default templates', async () => {
    const {ctx, sendEmail} = testContext();
    const service = emailNotifications({to: ['a@example.com']});
    const result = await service.onAction!(ctx, testAction());

    expect(sendEmail).toHaveBeenCalledOnce();
    const email = sendEmail.mock.calls[0][0];
    expect(email.to).toEqual(['a@example.com']);
    expect(email.subject).toBe('[Root CMS] doc.publish by user@example.com');
    expect(email.body).toContain('Action: doc.publish');
    expect(email.body).toContain('By: user@example.com');
    expect(email.body).toContain('Time: 2026-07-21T12:00:00.000Z');
    expect(email.body).toContain('"docId": "Pages/foo"');
    expect(email.htmlBody).toContain('<h2>doc.publish</h2>');
    expect(email.htmlBody).toContain(
      '&quot;docId&quot;: &quot;Pages/foo&quot;'
    );
    expect(result).toEqual({
      status: 'success',
      message: 'queued email email-id-1 to 1 recipient(s)',
    });
  });

  it('passes from, emailService, and expiration to sendEmail', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(TEST_DATE);
    try {
      const {ctx, sendEmail} = testContext();
      const service = emailNotifications({
        to: ['a@example.com'],
        from: 'cms@example.com',
        emailService: 'https://services.example.com',
        expireAfterMinutes: 60,
      });
      await service.onAction!(ctx, testAction());

      const email = sendEmail.mock.calls[0][0];
      expect(email.from).toBe('cms@example.com');
      expect(email.emailService).toBe('https://services.example.com');
      expect(email.expiresAt).toEqual(
        new Date(TEST_DATE.getTime() + 60 * 60 * 1000)
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('filters actions using wildcard patterns', async () => {
    const {ctx, sendEmail} = testContext();
    const service = emailNotifications({
      to: ['a@example.com'],
      actions: ['doc.publish', 'release.*'],
    });

    expect(await service.onAction!(ctx, testAction())).toMatchObject({
      status: 'success',
    });
    expect(
      await service.onAction!(ctx, testAction({action: 'release.publish'}))
    ).toMatchObject({status: 'success'});
    expect(
      await service.onAction!(ctx, testAction({action: 'doc.save'}))
    ).toEqual({status: 'info', message: 'ignored action: doc.save'});
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it('matches action patterns case-insensitively and supports "?"', async () => {
    const {ctx, sendEmail} = testContext();
    const service = emailNotifications({
      to: ['a@example.com'],
      actions: ['DOC.puBLIsh', 'doc.sav?'],
    });
    await service.onAction!(ctx, testAction());
    await service.onAction!(ctx, testAction({action: 'doc.save'}));
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it('skips actions rejected by the filter option', async () => {
    const {ctx, sendEmail} = testContext();
    const service = emailNotifications({
      to: ['a@example.com'],
      filter: async (action) => action.by !== 'system',
    });
    expect(await service.onAction!(ctx, testAction({by: 'system'}))).toEqual({
      status: 'info',
      message: 'filtered action: doc.publish',
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('resolves recipients using a function', async () => {
    const {ctx, sendEmail} = testContext();
    const service = emailNotifications({
      to: async (action) => [`watchers-${action.metadata.docId}@example.com`],
    });
    await service.onAction!(ctx, testAction());
    expect(sendEmail.mock.calls[0][0].to).toEqual([
      'watchers-Pages/foo@example.com',
    ]);
  });

  it('skips notifications with no recipients', async () => {
    const {ctx, sendEmail} = testContext();
    const service = emailNotifications({to: async () => [' ', '']});
    expect(await service.onAction!(ctx, testAction())).toEqual({
      status: 'info',
      message: 'no recipients',
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('renders templates using transformed data', async () => {
    const {ctx, sendEmail} = testContext();
    const service = emailNotifications({
      to: ['a@example.com'],
      transformData: async (action) => ({
        docUrl: `https://example.com/cms/content/${action.metadata.docId}`,
      }),
      template: {
        subject: 'doc published',
        body: 'View the doc at {docUrl}.',
        html: '<a href="{docUrl}">View the doc</a>',
      },
    });
    await service.onAction!(ctx, testAction());

    const email = sendEmail.mock.calls[0][0];
    expect(email.subject).toBe('doc published');
    expect(email.body).toBe(
      'View the doc at https://example.com/cms/content/Pages/foo.'
    );
    expect(email.htmlBody).toBe(
      '<a href="https://example.com/cms/content/Pages/foo">View the doc</a>'
    );
  });

  it('falls back to default templates for missing template values', async () => {
    const {ctx, sendEmail} = testContext();
    const service = emailNotifications({
      to: ['a@example.com'],
      template: {subject: '{metadata.docId} published'},
    });
    await service.onAction!(ctx, testAction());

    const email = sendEmail.mock.calls[0][0];
    expect(email.subject).toBe('Pages/foo published');
    expect(email.body).toContain('Action: doc.publish');
    expect(email.htmlBody).toContain('<h2>doc.publish</h2>');
  });

  it('sends a plain-text-only email when the template only has a body', async () => {
    const {ctx, sendEmail} = testContext();
    const service = emailNotifications({
      to: ['a@example.com'],
      template: {
        subject: '{metadata.docId} published',
        body: '{metadata.docId} was published by {by}.',
      },
    });
    await service.onAction!(ctx, testAction());

    const email = sendEmail.mock.calls[0][0];
    expect(email.subject).toBe('Pages/foo published');
    expect(email.body).toBe('Pages/foo was published by user@example.com.');
    expect(email.htmlBody).toBeUndefined();
  });

  it('omits the plain-text body when the template only has html', async () => {
    const {ctx, sendEmail} = testContext();
    const service = emailNotifications({
      to: ['a@example.com'],
      template: {html: '<p>{metadata.docId} was published.</p>'},
    });
    await service.onAction!(ctx, testAction());

    // `sendEmail()` derives the plain-text body from the html body.
    const email = sendEmail.mock.calls[0][0];
    expect(email.htmlBody).toBe('<p>Pages/foo was published.</p>');
    expect(email.body).toBeUndefined();
  });

  it('composes custom templates with the exported defaults', async () => {
    const {ctx, sendEmail} = testContext();
    const service = emailNotifications({
      to: ['a@example.com'],
      template: {...DEFAULT_EMAIL_TEMPLATE, subject: 'custom subject'},
    });
    await service.onAction!(ctx, testAction());

    const email = sendEmail.mock.calls[0][0];
    expect(email.subject).toBe('custom subject');
    expect(email.body).toContain('Action: doc.publish');
    expect(email.htmlBody).toContain('<h2>doc.publish</h2>');
  });

  it('uses function templates verbatim', async () => {
    const {ctx, sendEmail} = testContext();
    const service = emailNotifications({
      to: ['a@example.com'],
      template: (data, action) => ({
        subject: `published ${action.metadata.docId}`,
        html: '<p>No {rendering} or <escaping> applied.</p>',
      }),
    });
    await service.onAction!(ctx, testAction());

    const email = sendEmail.mock.calls[0][0];
    expect(email.subject).toBe('published Pages/foo');
    expect(email.htmlBody).toBe('<p>No {rendering} or <escaping> applied.</p>');
    expect(email.body).toBeUndefined();
  });

  it('falls back to defaults when a function template omits content', async () => {
    const {ctx, sendEmail} = testContext();
    const service = emailNotifications({
      to: ['a@example.com'],
      template: () => ({}),
    });
    await service.onAction!(ctx, testAction());

    const email = sendEmail.mock.calls[0][0];
    expect(email.subject).toBe('[Root CMS] doc.publish by user@example.com');
    expect(email.body).toContain('Action: doc.publish');
    expect(email.htmlBody).toBeUndefined();
  });
});
