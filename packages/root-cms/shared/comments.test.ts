import {describe, expect, it} from 'vitest';
import {
  countThreadComments,
  fieldKeyToThreadId,
  FieldCommentThread,
  getThreadComments,
  isOpenThread,
  normalizeEmails,
  sortThreads,
  truncateCommentContent,
} from './comments.js';

function ts(millis: number) {
  return {toMillis: () => millis, toDate: () => new Date(millis)};
}

function thread(overrides: Partial<FieldCommentThread>): FieldCommentThread {
  return {
    id: 'fields.title',
    docId: 'Pages/foo',
    fieldKey: 'fields.title',
    status: 'open',
    comments: [],
    participants: [],
    createdAt: ts(1),
    createdBy: 'a@example.com',
    ...overrides,
  };
}

describe('fieldKeyToThreadId', () => {
  it('derives a short, deterministic id from the deep key', async () => {
    const id = await fieldKeyToThreadId('fields.hero.title');
    expect(id).toMatch(/^title-[0-9a-f]{24}$/);
    expect(await fieldKeyToThreadId('fields.hero.title')).toBe(id);
    expect(await fieldKeyToThreadId('fields.footer.title')).not.toBe(id);
  });

  it('stays bounded for deeply nested keys', async () => {
    const key = Array.from(
      {length: 20},
      (_, i) => `a_very_long_field_identifier_${i}.k1a2b3c4`
    ).join('.');
    expect(key.length).toBeGreaterThan(700);
    const id = await fieldKeyToThreadId(`fields.${key}`);
    expect(id.length).toBeLessThanOrEqual(50);
    expect(id).not.toContain('/');
  });

  it('sanitizes the readable prefix', async () => {
    expect(await fieldKeyToThreadId('fields.Hero Title!')).toMatch(
      /^hero-title-[0-9a-f]{24}$/
    );
    expect(await fieldKeyToThreadId('fields.日本語')).toMatch(/^[0-9a-f]{24}$/);
  });

  it('rejects empty keys', async () => {
    await expect(fieldKeyToThreadId('  ')).rejects.toThrow();
  });
});

describe('thread helpers', () => {
  it('treats threads without a resolved status as open', () => {
    expect(isOpenThread({status: 'open'})).toBe(true);
    expect(isOpenThread({status: 'resolved'})).toBe(false);
  });

  it('separates comments from system events', () => {
    const t = thread({
      comments: [
        {id: '1', createdAt: ts(1), createdBy: 'a@example.com'},
        {id: '2', type: 'resolved', createdAt: ts(2), createdBy: 'a@x.com'},
        {
          id: '3',
          type: 'comment',
          createdAt: ts(3),
          createdBy: 'b@example.com',
          deleted: true,
        },
      ],
    });
    expect(getThreadComments(t).map((c) => c.id)).toEqual(['1', '3']);
    expect(countThreadComments(t)).toBe(1);
  });

  it('normalizes email lists', () => {
    expect(
      normalizeEmails([' A@Example.com', 'a@example.com', '', null])
    ).toEqual(['a@example.com']);
  });

  it('truncates long content with an ellipsis', () => {
    expect(truncateCommentContent('hello world', 20)).toBe('hello world');
    expect(truncateCommentContent('hello world', 6)).toBe('hello…');
  });

  it('sorts open threads before resolved ones, most recent first', () => {
    const sorted = sortThreads([
      thread({id: 'resolved-new', status: 'resolved', updatedAt: ts(50)}),
      thread({id: 'open-old', updatedAt: ts(10)}),
      thread({id: 'open-new', updatedAt: ts(20)}),
    ]);
    expect(sorted.map((t) => t.id)).toEqual([
      'open-new',
      'open-old',
      'resolved-new',
    ]);
  });
});
