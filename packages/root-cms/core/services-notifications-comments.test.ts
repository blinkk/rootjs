import {describe, expect, it, vi} from 'vitest';
import type {Action} from './client.js';
import {
  buildCommentEmailTemplateData,
  commentEmailNotifications,
} from './services-notifications-comments.js';
import type {NotificationServiceContext} from './services-notifications.js';

function fakeTimestamp(date: Date) {
  return {toDate: () => date, toMillis: () => date.getTime()} as any;
}

function commentAction(overrides?: Partial<Action>): Action {
  return {
    action: 'doc.comment.add',
    by: 'author@example.com',
    timestamp: fakeTimestamp(new Date('2026-07-21T12:00:00.000Z')),
    metadata: {
      docId: 'Pages/foo',
      collectionId: 'Pages',
      slug: 'foo',
      fieldKey: 'fields.hero.title',
      fieldLabel: 'Hero › Title',
      threadId: 'fields.hero.title',
      commentId: 'c1',
      content: 'Can we shorten this?',
      mentions: ['Mentioned@example.com'],
      participants: ['author@example.com', 'earlier@example.com'],
    },
    ...overrides,
  };
}

function testContext(domain?: string) {
  const sendEmail = vi.fn(async () => 'email-id-1');
  const ctx = {
    rootConfig: {domain} as any,
    cmsClient: {sendEmail} as any,
    user: {email: 'author@example.com'},
  } as NotificationServiceContext;
  return {ctx, sendEmail};
}

describe('buildCommentEmailTemplateData', () => {
  it('derives template data and a deeplink url from the action', () => {
    const {ctx} = testContext('https://example.com/');
    const data = buildCommentEmailTemplateData(commentAction(), ctx)!;
    expect(data.by).toBe('author@example.com');
    expect(data.fieldLabel).toBe('Hero › Title');
    expect(data.mentions).toEqual(['mentioned@example.com']);
    expect(data.summary).toBe(
      'author@example.com commented on "Hero › Title" in Pages/foo'
    );
    expect(data.url).toBe(
      'https://example.com/cms/content/Pages/foo?deeplink=fields.hero.title'
    );
  });

  it('returns null for unrelated or incomplete actions', () => {
    const {ctx} = testContext();
    expect(
      buildCommentEmailTemplateData(commentAction({action: 'doc.publish'}), ctx)
    ).toBeNull();
    expect(
      buildCommentEmailTemplateData(
        commentAction({metadata: {docId: 'Pages/foo'}}),
        ctx
      )
    ).toBeNull();
  });
});

describe('commentEmailNotifications', () => {
  it('emails mentioned users and participants, excluding the author', async () => {
    const {ctx, sendEmail} = testContext('https://example.com');
    const service = commentEmailNotifications();
    const result = await service.onAction!(ctx, commentAction());
    expect(result?.status).toBe('success');
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const email = (sendEmail.mock.calls[0] as any)[0];
    expect(email.to.sort()).toEqual([
      'earlier@example.com',
      'mentioned@example.com',
    ]);
    expect(email.subject).toBe(
      '[Root CMS] author@example.com commented on "Hero › Title" in Pages/foo'
    );
    expect(email.body).toContain('Can we shorten this?');
    expect(email.body).toContain(
      'https://example.com/cms/content/Pages/foo?deeplink=fields.hero.title'
    );
    expect(email.htmlBody).toContain('Open in Root CMS');
  });

  it('skips when there is nobody to notify', async () => {
    const {ctx, sendEmail} = testContext();
    const service = commentEmailNotifications();
    const result = await service.onAction!(
      ctx,
      commentAction({
        metadata: {
          docId: 'Pages/foo',
          fieldKey: 'fields.title',
          participants: ['author@example.com'],
        },
      })
    );
    expect(result?.status).toBe('info');
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('ignores actions outside the configured list', async () => {
    const {ctx, sendEmail} = testContext();
    const service = commentEmailNotifications();
    const result = await service.onAction!(
      ctx,
      commentAction({action: 'doc.comment.edit'})
    );
    expect(result?.status).toBe('info');
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('supports extra recipients, filters and custom templates', async () => {
    const {ctx, sendEmail} = testContext();
    const service = commentEmailNotifications({
      notifyParticipants: false,
      to: (data) => (data.collectionId === 'Pages' ? ['team@example.com'] : []),
      filter: (data) => data.fieldKey.startsWith('fields.hero'),
      template: {subject: 'New comment from {by}: {content}'},
    });
    await service.onAction!(ctx, commentAction());
    const email = (sendEmail.mock.calls[0] as any)[0];
    expect(email.to.sort()).toEqual([
      'mentioned@example.com',
      'team@example.com',
    ]);
    expect(email.subject).toBe(
      'New comment from author@example.com: Can we shorten this?'
    );

    sendEmail.mockClear();
    const filtered = await service.onAction!(
      ctx,
      commentAction({
        metadata: {...commentAction().metadata, fieldKey: 'fields.body'},
      })
    );
    expect(filtered?.status).toBe('info');
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('sends a single email when a comment reopens a thread', async () => {
    const {ctx, sendEmail} = testContext();
    const service = commentEmailNotifications();
    await service.onAction!(
      ctx,
      commentAction({
        metadata: {...commentAction().metadata, reopened: true},
      })
    );
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const email = (sendEmail.mock.calls[0] as any)[0];
    expect(email.subject).toBe(
      '[Root CMS] author@example.com reopened and commented on "Hero › Title" in Pages/foo'
    );
  });

  it('describes resolve actions without comment content', async () => {
    const {ctx, sendEmail} = testContext();
    const service = commentEmailNotifications();
    await service.onAction!(
      ctx,
      commentAction({
        action: 'doc.comment.resolve',
        by: 'earlier@example.com',
        metadata: {
          docId: 'Pages/foo',
          fieldKey: 'fields.hero.title',
          fieldLabel: 'Hero › Title',
          participants: ['author@example.com', 'earlier@example.com'],
        },
      })
    );
    const email = (sendEmail.mock.calls[0] as any)[0];
    expect(email.to).toEqual(['author@example.com']);
    expect(email.subject).toContain('resolved the comments on "Hero › Title"');
  });
});
