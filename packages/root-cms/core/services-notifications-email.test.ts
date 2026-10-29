import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {Action, RootCMSClient} from './client.js';
import {
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
  const sendEmail = vi.fn<RootCMSClient['sendEmail']>(async () => 'email-id-1');
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

  it('queues an email using the default templates', async () => {
    const {ctx, sendEmail} = testContext();
    const service = emailNotifications({to: ['a@example.com']});
    const result = await service.onAction!(ctx, testAction());

    expect(sendEmail).toHaveBeenCalledOnce();
    const email = sendEmail.mock.calls[0][0];
    expect(email.to).toEqual(['a@example.com']);
    expect(email.subject).toBe('[Root.js] doc.publish by user@example.com');
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
});
