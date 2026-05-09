/**
 * Uploads a markdown file to a doc in the BlogPosts collection as a draft.
 *
 * Usage:
 *   node docs/scripts/upload_blog_post_md.mjs <path> <doc-id-or-slug>
 *
 * Examples:
 *   node docs/scripts/upload_blog_post_md.mjs docs/blog-wip/v3.md BlogPosts/v3
 *   node docs/scripts/upload_blog_post_md.mjs docs/blog-wip/v3.md v3
 *
 * The first heading is stripped (it becomes meta.title). YAML-style
 * frontmatter at the top of the file is parsed for `title`, `description`,
 * and `image`. Anything else is folded into the richtext body.
 *
 * Run from the docs/ project root so root.config.ts is picked up.
 */

import fs from 'node:fs';
import path from 'node:path';
import {loadRootConfig} from '@blinkk/root/node';
import {RootCMSClient} from '@blinkk/root-cms';
import {marked} from 'marked';

const DEFAULT_COLLECTION = 'BlogPosts';

async function main() {
  const [, , mdPathArg, docIdArg] = process.argv;
  if (!mdPathArg || !docIdArg) {
    console.error(
      'Usage: node docs/scripts/upload_blog_post_md.mjs <path> <doc-id-or-slug>'
    );
    process.exit(1);
  }

  const mdPath = path.resolve(mdPathArg);
  if (!fs.existsSync(mdPath)) {
    console.error(`File not found: ${mdPath}`);
    process.exit(1);
  }

  const docId = docIdArg.includes('/')
    ? docIdArg
    : `${DEFAULT_COLLECTION}/${docIdArg}`;

  const raw = fs.readFileSync(mdPath, 'utf-8');
  const {frontmatter, body} = splitFrontmatter(raw);
  const {title, bodyWithoutH1} = extractTitle(body);
  const richtext = markdownToRichText(bodyWithoutH1);

  const fields = {
    meta: {
      title: frontmatter.title ?? title ?? '',
      description: frontmatter.description ?? '',
    },
    content: {
      body: richtext,
    },
  };
  if (frontmatter.image) {
    fields.meta.image = {src: frontmatter.image};
  }

  console.log(`Loading Root config from ${process.cwd()}...`);
  const rootConfig = await loadRootConfig(process.cwd());
  const client = new RootCMSClient(rootConfig);

  console.log(`Saving draft: ${docId}`);
  console.log(`  Title: ${fields.meta.title}`);
  console.log(`  Blocks: ${richtext.blocks.length}`);
  await client.saveDraftData(docId, fields, {
    modifiedBy: 'upload_blog_post_md.mjs',
  });
  console.log('Done. Open the doc in the CMS to review and publish.');
}

/** Splits a `---\nkey: value\n---\n` frontmatter block off the top of a file. */
function splitFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return {frontmatter: {}, body: text};
  }
  const frontmatter = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/);
    if (m) {
      let value = m[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      frontmatter[m[1]] = value;
    }
  }
  return {frontmatter, body: text.slice(match[0].length)};
}

/** Strips the first H1 (if any) and returns it as the title. */
function extractTitle(body) {
  const match = body.match(/^\s*#\s+(.+?)\s*\n/);
  if (!match) {
    return {title: undefined, bodyWithoutH1: body};
  }
  return {
    title: match[1].trim(),
    bodyWithoutH1: body.slice(match[0].length),
  };
}

/** Converts a markdown string to a CMS RichTextData object. */
function markdownToRichText(md) {
  const tokens = marked.lexer(md);
  const blocks = [];
  for (const token of tokens) {
    const block = tokenToBlock(token);
    if (Array.isArray(block)) {
      blocks.push(...block);
    } else if (block) {
      blocks.push(block);
    }
  }
  return {
    blocks,
    time: Date.now(),
    version: '2.28.2',
  };
}

function tokenToBlock(token) {
  switch (token.type) {
    case 'heading':
      return {
        type: 'heading',
        data: {
          level: token.depth,
          text: inlineMarkdownToHtml(token.text),
        },
      };

    case 'paragraph':
      return {
        type: 'paragraph',
        data: {text: inlineMarkdownToHtml(token.text)},
      };

    case 'list':
      return {
        type: token.ordered ? 'orderedList' : 'unorderedList',
        data: {
          style: token.ordered ? 'ordered' : 'unordered',
          items: token.items.map(listItemToRichText),
        },
      };

    case 'code':
      return {
        type: 'html',
        data: {html: codeBlockToHtml(token.text, token.lang)},
      };

    case 'blockquote':
      return {
        type: 'html',
        data: {
          html: `<blockquote>${inlineMarkdownToHtml(token.text)}</blockquote>`,
        },
      };

    case 'hr':
      return {type: 'html', data: {html: '<hr>'}};

    case 'html':
      return {type: 'html', data: {html: token.text}};

    case 'table':
      return tableTokenToBlock(token);

    case 'space':
      return null;

    default:
      // Fallback: render the source as HTML so nothing is lost.
      if (token.raw) {
        return {type: 'html', data: {html: marked.parse(token.raw)}};
      }
      return null;
  }
}

function listItemToRichText(item) {
  // Marked's list item tokens contain a mix of text and nested lists. Find a
  // nested list (if any) and treat the rest as the item's content.
  let nestedListToken = null;
  const contentParts = [];
  for (const child of item.tokens || []) {
    if (child.type === 'list') {
      nestedListToken = child;
    } else if (child.type === 'text') {
      contentParts.push(inlineMarkdownToHtml(child.text));
    } else if (child.type === 'paragraph') {
      contentParts.push(inlineMarkdownToHtml(child.text));
    } else if (child.raw) {
      contentParts.push(marked.parseInline(child.raw));
    }
  }
  const result = {content: contentParts.join('').trim()};
  if (nestedListToken) {
    result.itemsType = nestedListToken.ordered ? 'orderedList' : 'unorderedList';
    result.items = nestedListToken.items.map(listItemToRichText);
  }
  return result;
}

function tableTokenToBlock(token) {
  const headerCells = (token.header || []).map((cell) => ({
    type: 'header',
    blocks: [
      {type: 'paragraph', data: {text: inlineMarkdownToHtml(cell.text)}},
    ],
  }));
  const rows = [];
  if (headerCells.length > 0) {
    rows.push({cells: headerCells});
  }
  for (const row of token.rows || []) {
    rows.push({
      cells: row.map((cell) => ({
        type: 'data',
        blocks: [
          {type: 'paragraph', data: {text: inlineMarkdownToHtml(cell.text)}},
        ],
      })),
    });
  }
  return {type: 'table', data: {rows}};
}

function inlineMarkdownToHtml(text) {
  if (!text) {
    return '';
  }
  // marked.parseInline() converts inline markdown (bold, italic, links,
  // codespans, etc.) to HTML without wrapping in <p>.
  return marked.parseInline(text);
}

function codeBlockToHtml(code, lang) {
  const langClass = lang ? ` class="language-${escapeAttr(lang)}"` : '';
  return `<pre><code${langClass}>${escapeHtml(code)}</code></pre>`;
}

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(s) {
  return s.replace(/"/g, '&quot;').replace(/&/g, '&amp;');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
