import {promises as fs} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline/promises';
import glob from 'tiny-glob';

interface RootAiOptions {
  apiKey?: string;
  model?: string;
  yes?: boolean;
  dryRun?: boolean;
  json?: boolean;
}

interface RootAiResponse {
  summary?: string;
  notes?: string[];
  changes?: RootAiFileChange[];
}

interface RootAiFileChange {
  path: string;
  content: string;
  reason?: string;
}

interface RootProjectInfo {
  rootDir: string;
  hasRootCms: boolean;
  routes: string[];
  templates: string[];
  schemas: string[];
  docs: string[];
}

const DEFAULT_MODEL = 'gemini-2.5-pro';
const GEMINI_API_HOST = 'https://generativelanguage.googleapis.com';

/**
 * Runs Root AI in one-shot mode and writes generated files to disk.
 */
export async function ai(
  promptArg: string[] | string | undefined,
  options: RootAiOptions
) {
  const prompt = await resolvePrompt(promptArg);
  if (!prompt) {
    throw new Error('missing prompt. Usage: root ai "create a new route"');
  }

  const apiKey = options.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'missing API key. Set GEMINI_API_KEY or pass --api-key <key>.'
    );
  }

  const project = await inspectProject(process.cwd());
  const model = options.model || process.env.ROOT_AI_MODEL || DEFAULT_MODEL;
  const response = await requestAiResponse({
    prompt,
    apiKey,
    model,
    project,
  });

  if (options.json) {
    console.log(JSON.stringify(response, null, 2));
    return;
  }

  if (!response.changes || response.changes.length === 0) {
    console.log(response.summary || 'No file changes were requested.');
    if (response.notes && response.notes.length > 0) {
      console.log(`\nNotes:\n- ${response.notes.join('\n- ')}`);
    }
    return;
  }

  if (response.summary) {
    console.log(`Summary: ${response.summary}`);
  }
  console.log('Planned file changes:');
  for (const change of response.changes) {
    const reason = change.reason ? ` — ${change.reason}` : '';
    console.log(`- ${change.path}${reason}`);
  }

  if (options.dryRun) {
    console.log('\nDry run enabled. No files were written.');
    return;
  }

  const shouldApply = options.yes ? true : await confirmApply();
  if (!shouldApply) {
    console.log('Skipped writing files.');
    return;
  }

  for (const change of response.changes) {
    const target = resolveOutputPath(project.rootDir, change.path);
    await fs.mkdir(path.dirname(target), {recursive: true});
    await fs.writeFile(target, change.content, 'utf-8');
    console.log(`saved ${path.relative(project.rootDir, target)}`);
  }
}

async function resolvePrompt(
  promptArg: string[] | string | undefined
): Promise<string> {
  const promptText = Array.isArray(promptArg)
    ? promptArg.join(' ').trim()
    : (promptArg || '').trim();
  if (promptText) {
    return promptText;
  }

  if (!process.stdin.isTTY) {
    const chunks: string[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(String(chunk));
    }
    return chunks.join('').trim();
  }

  return '';
}

async function confirmApply(): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer = await rl.question('\nApply these changes? (y/N): ');
  rl.close();
  return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
}

function resolveOutputPath(rootDir: string, targetPath: string): string {
  const outputPath = path.resolve(rootDir, targetPath);
  const rel = path.relative(rootDir, outputPath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`invalid path outside project: ${targetPath}`);
  }
  return outputPath;
}

async function inspectProject(rootDir: string): Promise<RootProjectInfo> {
  const packageJson = await readPackageJson(rootDir);
  const hasRootCms = Boolean(
    packageJson.dependencies?.['@blinkk/root-cms'] ||
      packageJson.devDependencies?.['@blinkk/root-cms']
  );

  const [routes, templates, schemas, docs] = await Promise.all([
    glob('routes/**/*.{ts,tsx,md,mdx}', {cwd: rootDir}),
    glob('templates/**/*.{ts,tsx}', {cwd: rootDir}),
    glob('**/*.schema.ts', {
      cwd: rootDir,
      ignore: ['node_modules/**', 'dist/**'],
    }),
    glob('docs/**/*.{md,mdx,json,yaml,yml}', {
      cwd: rootDir,
      ignore: ['node_modules/**', 'dist/**'],
    }),
  ]);

  return {
    rootDir,
    hasRootCms,
    routes: routes.slice(0, 40),
    templates: templates.slice(0, 40),
    schemas: schemas.slice(0, 40),
    docs: docs.slice(0, 40),
  };
}

async function readPackageJson(rootDir: string): Promise<any> {
  try {
    const content = await fs.readFile(path.join(rootDir, 'package.json'), 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

async function requestAiResponse(options: {
  prompt: string;
  apiKey: string;
  model: string;
  project: RootProjectInfo;
}): Promise<RootAiResponse> {
  const {prompt, apiKey, model, project} = options;
  const endpoint = `${GEMINI_API_HOST}/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const payload = {
    systemInstruction: {
      parts: [
        {
          text: createSystemPrompt(project),
        },
      ],
    },
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
    },
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: createUserPrompt(prompt, project),
          },
        ],
      },
    ],
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Root AI request failed (${res.status}): ${text}`);
  }

  const data: any = await res.json();
  const text = extractTextResponse(data);
  const parsed = parseAiJson(text);
  validateResponse(parsed);
  return parsed;
}

function createSystemPrompt(project: RootProjectInfo): string {
  const cmsText = project.hasRootCms
    ? 'The project has @blinkk/root-cms enabled. You may also edit docs content files when requested.'
    : 'The project does not have @blinkk/root-cms installed. Do not create doc content editing tasks unless explicitly asked for non-CMS docs.';

  return [
    'You are Root AI, an expert Root.js coding assistant.',
    'Return JSON only using this schema:',
    '{"summary": string, "notes": string[], "changes": [{"path": string, "reason": string, "content": string}]}',
    'Rules:',
    '- Always generate complete file contents for each change.',
    '- Prefer creating routes in routes/, templates in templates/, and schemas in collections/ or templates/*.schema.ts.',
    '- Keep TypeScript strict and compatible with Root.js conventions.',
    `- ${cmsText}`,
    '- If no changes are needed, return an empty changes array.',
  ].join('\n');
}

function createUserPrompt(userPrompt: string, project: RootProjectInfo): string {
  const lines = [
    `User request: ${userPrompt}`,
    '',
    `Project root: ${project.rootDir}`,
    `Has root-cms: ${project.hasRootCms ? 'yes' : 'no'}`,
    '',
    'Existing routes (subset):',
    ...formatList(project.routes),
    '',
    'Existing templates (subset):',
    ...formatList(project.templates),
    '',
    'Existing schemas (subset):',
    ...formatList(project.schemas),
  ];

  if (project.hasRootCms) {
    lines.push('', 'Existing docs files (subset):', ...formatList(project.docs));
  }

  return lines.join('\n');
}

function formatList(items: string[]): string[] {
  if (items.length === 0) {
    return ['(none found)'];
  }
  return items.map((item) => `- ${item}`);
}

function extractTextResponse(data: any): string {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    throw new Error('Root AI returned an unexpected response shape.');
  }
  const texts = parts.map((part: any) => part?.text).filter(Boolean);
  if (texts.length === 0) {
    throw new Error('Root AI returned an empty response.');
  }
  return texts.join('\n');
}

function parseAiJson(text: string): RootAiResponse {
  const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/```$/i, '');
  return JSON.parse(cleaned) as RootAiResponse;
}

function validateResponse(response: RootAiResponse) {
  if (!response || !Array.isArray(response.changes)) {
    throw new Error('Root AI response is missing a valid changes array.');
  }
  for (const change of response.changes) {
    if (!change.path || typeof change.path !== 'string') {
      throw new Error('Root AI response has a change with an invalid path.');
    }
    if (typeof change.content !== 'string') {
      throw new Error(`Root AI response has invalid content for ${change.path}.`);
    }
  }
}
