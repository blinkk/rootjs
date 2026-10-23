import {RootConfig} from '@blinkk/root';
import {describe, expect, it, vi} from 'vitest';
import {z} from 'zod';
import {expandSkillInvocations} from '../shared/ai/extensions.js';
import {
  AiToolContext,
  callAiTool,
  defineAiTool,
  getAiExtensions,
  serializeAiTools,
} from './ai-extensions.js';

const lookupTool = defineAiTool({
  name: 'inventory_lookup',
  description: 'Looks up stock.',
  inputSchema: z.object({sku: z.string()}),
  execute: async ({sku}) => ({sku, stock: 3}),
});

const sendTool = defineAiTool({
  name: 'newsletter_send',
  description: 'Sends the newsletter.',
  inputSchema: z.object({}),
  write: true,
  execute: async () => ({sent: true}),
});

function createRootConfig(): RootConfig {
  return {
    rootDir: '/tmp',
    plugins: [
      {
        name: 'root-cms',
        getConfig: () => ({
          ai: {
            models: [],
            tools: [lookupTool],
            skills: [{name: 'seo', instructions: 'Check the SEO fields.'}],
          },
        }),
      },
      {
        name: 'newsletter',
        rootAi: {
          tools: [
            sendTool,
            // Reserved, duplicate and invalid names are skipped.
            {...lookupTool, name: 'doc_get'},
            {...lookupTool},
            {...lookupTool, name: 'bad name'},
          ],
          skills: [{name: 'launch', instructions: 'Run the checklist.'}],
        },
      },
    ],
  } as any;
}

describe('getAiExtensions', () => {
  it('merges tools and skills from the cmsPlugin and other plugins', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const {tools, skills} = getAiExtensions(createRootConfig());
    expect(tools.map((t) => t.name)).toEqual([
      'inventory_lookup',
      'newsletter_send',
    ]);
    expect(skills.map((s) => s.name)).toEqual(['seo', 'launch']);
    warn.mockRestore();
  });
});

describe('serializeAiTools', () => {
  it('converts schemas to JSON Schema and filters by role and mode', async () => {
    const tools = [lookupTool, sendTool];
    const editor = await serializeAiTools(tools, {
      role: 'EDITOR',
      readOnly: false,
    });
    expect(editor.map((t) => [t.name, t.write])).toEqual([
      ['inventory_lookup', false],
      ['newsletter_send', true],
    ]);
    expect(editor[0].inputSchema).toMatchObject({
      type: 'object',
      properties: {sku: {type: 'string'}},
    });

    const readOnly = await serializeAiTools(tools, {
      role: 'EDITOR',
      readOnly: true,
    });
    expect(readOnly.map((t) => t.name)).toEqual(['inventory_lookup']);

    const viewer = await serializeAiTools(tools, {
      role: 'VIEWER',
      readOnly: false,
    });
    expect(viewer.map((t) => t.name)).toEqual(['inventory_lookup']);
  });
});

describe('callAiTool', () => {
  const ctx = (role: AiToolContext['role']) => ({role}) as AiToolContext;

  it('validates input before running the tool', async () => {
    const tools = [lookupTool];
    await expect(
      callAiTool(tools, 'inventory_lookup', {sku: 'a'}, ctx('VIEWER'))
    ).resolves.toEqual({sku: 'a', stock: 3});
    await expect(
      callAiTool(tools, 'inventory_lookup', {sku: 1}, ctx('VIEWER'))
    ).rejects.toMatchObject({code: 'INVALID_INPUT'});
    await expect(
      callAiTool(tools, 'missing', {}, ctx('VIEWER'))
    ).rejects.toMatchObject({code: 'UNKNOWN_TOOL'});
  });

  it('enforces tool roles', async () => {
    const tools = [sendTool, {...lookupTool, roles: ['ADMIN' as const]}];
    await expect(
      callAiTool(tools, 'newsletter_send', {}, ctx('VIEWER'))
    ).rejects.toMatchObject({code: 'FORBIDDEN'});
    await expect(
      callAiTool(tools, 'inventory_lookup', {sku: 'a'}, ctx('EDITOR'))
    ).rejects.toMatchObject({code: 'FORBIDDEN'});
    await expect(
      callAiTool(tools, 'newsletter_send', {}, ctx('CONTRIBUTOR'))
    ).resolves.toEqual({sent: true});
  });
});

describe('expandSkillInvocations', () => {
  const skills = [{name: 'seo', instructions: 'Check the SEO fields.'}];

  it('expands a known skill in user messages only', () => {
    const messages = [
      {role: 'user', parts: [{type: 'text', text: '/seo Pages/home'}]},
      {role: 'assistant', parts: [{type: 'text', text: '/seo'}]},
      {role: 'user', parts: [{type: 'text', text: '/unknown hi'}]},
      {role: 'user', parts: [{type: 'text', text: 'use /seo'}]},
    ];
    const result = expandSkillInvocations(messages, skills);
    expect(result[0].parts[0].text).toContain('Check the SEO fields.');
    expect(result[0].parts[0].text).toContain('Pages/home');
    expect(result.slice(1)).toEqual(messages.slice(1));
    // The original messages (shown in the transcript) are untouched.
    expect(messages[0].parts[0].text).toBe('/seo Pages/home');
  });
});
