/**
 * @fileoverview Generates the CLI and API reference data for the docs, from the
 * built packages in this repo.
 *
 * - CLI: loads each package's commander program (without running it) and
 *   records every command, argument and option.
 * - API: reads the `.d.ts` files emitted for each public entry point in the
 *   package's `exports` and records every export with its signature and doc
 *   comment.
 *
 * The output is written to `reference/*.json` and rendered by the docs route on
 * pages whose "Generated reference" field is set (see `utils/reference.ts`).
 *
 * The packages need to be built first. From the repo root:
 *
 *   pnpm build
 *
 * Then, from the `docs/` dir:
 *
 *   node scripts/generate_reference.ts
 */

import {mkdir, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import ts from 'typescript-api';
import type {
  ApiEntryPoint,
  ApiExport,
  ApiMember,
  ApiReference,
  CliCommand,
  CliReference,
} from '../utils/reference-types.ts';

const DOCS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const PACKAGES_DIR = path.resolve(DOCS_DIR, '../packages');
const OUT_DIR = path.join(DOCS_DIR, 'reference');

interface PackageJson {
  name: string;
  version: string;
  bin?: Record<string, string>;
  exports?: Record<string, string | {types?: string}>;
}

function readPackageJson(pkgDir: string): PackageJson {
  const require = createRequire(import.meta.url);
  return require(path.join(pkgDir, 'package.json'));
}

// CLI reference.

interface CliSource {
  /** Package dir, relative to `packages/`. */
  pkg: string;
  bin: string;
  /** Loads the module that builds the commander program. */
  load: (pkgDir: string, pkg: PackageJson) => Promise<void>;
}

const CLI_SOURCES: CliSource[] = [
  {
    pkg: 'create-root',
    bin: 'create-root',
    // The module builds and parses its program on import.
    load: (pkgDir) => importModule(path.join(pkgDir, 'dist/create-root.js')),
  },
  {pkg: 'root', bin: 'root', load: runCliRunner('dist/cli.js', 'root')},
  {
    pkg: 'root-cms',
    bin: 'root-cms',
    load: runCliRunner('dist/cli.js', 'root-cms'),
  },
  {
    pkg: 'root-password-protect',
    bin: 'root-password-protect',
    load: runCliRunner('dist/cli.js', 'root-password-protect'),
  },
];

async function importModule(filePath: string) {
  await import(pathToFileURL(filePath).href);
}

/** Loads a `CliRunner` class and calls `run()`, which builds the program. */
function runCliRunner(distPath: string, name: string) {
  return async (pkgDir: string, pkg: PackageJson) => {
    const mod = await import(pathToFileURL(path.join(pkgDir, distPath)).href);
    await new mod.CliRunner(name, pkg.version).run(['node', name]);
  };
}

/**
 * Loads a CLI's commander program without running any command, by patching
 * `parse()` and `parseAsync()` to capture the program instead.
 */
async function captureProgram(source: CliSource) {
  const pkgDir = path.join(PACKAGES_DIR, source.pkg);
  const pkg = readPackageJson(pkgDir);
  // Use the same commander instance the CLI resolves.
  const require = createRequire(path.join(pkgDir, 'package.json'));
  const {Command} = require('commander');
  const originalParse = Command.prototype.parse;
  const originalParseAsync = Command.prototype.parseAsync;
  const originalLog = console.log;
  let program: any = null;
  const capture = (instance: any) => {
    program = instance;
    return instance;
  };
  Command.prototype.parse = function (this: any) {
    return capture(this);
  };
  Command.prototype.parseAsync = async function (this: any) {
    return capture(this);
  };
  // Silence banners printed while the program is built.
  console.log = () => {};
  try {
    await source.load(pkgDir, pkg);
  } finally {
    Command.prototype.parse = originalParse;
    Command.prototype.parseAsync = originalParseAsync;
    console.log = originalLog;
  }
  if (!program) {
    throw new Error(`failed to load the ${source.bin} cli`);
  }
  return {pkg, program};
}

/**
 * Splits a command description into a one-line summary, a longer description
 * and any usage examples (lines starting with `$`).
 */
function splitDescription(text: string) {
  const [summary, ...rest] = text.trim().split(/\n\s*\n/);
  const body: string[] = [];
  const examples: string[] = [];
  for (const block of rest) {
    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const exampleLines = lines.filter((line) => line.startsWith('$ '));
    if (exampleLines.length > 0) {
      examples.push(...exampleLines.map((line) => line.slice(2)));
      const other = lines.filter(
        (line) => !line.startsWith('$ ') && !/^usage examples?:$/i.test(line)
      );
      if (other.length > 0) {
        body.push(other.join(' '));
      }
    } else {
      body.push(lines.join(' '));
    }
  }
  return {
    summary: summary.replace(/\s+/g, ' ').trim(),
    description: body.join('\n\n'),
    examples,
  };
}

function toCliCommand(cmd: any, parents: string[]): CliCommand {
  const name = [...parents, cmd.name()].join(' ');
  const {summary, description, examples} = splitDescription(
    cmd.description() || ''
  );
  const args = (cmd.registeredArguments || []).map((arg: any) => ({
    name: arg.name(),
    required: arg.required,
    variadic: arg.variadic,
    description: arg.description || '',
    defaultValue: formatDefault(arg.defaultValue),
    choices: arg.argChoices || undefined,
  }));
  const usageArgs = args
    .map((arg: any) => {
      const label = `${arg.name}${arg.variadic ? '...' : ''}`;
      return arg.required ? `<${label}>` : `[${label}]`;
    })
    .join(' ');
  const options = cmd.options
    .filter((opt: any) => !opt.hidden && opt.long !== '--version')
    .map((opt: any) => ({
      flags: opt.flags,
      description: opt.description || '',
      defaultValue: formatDefault(opt.defaultValue),
      choices: opt.argChoices || undefined,
    }));
  const subcommands = cmd.commands
    .filter((sub: any) => !sub._hidden && sub.name() !== 'help')
    .map((sub: any) => toCliCommand(sub, [...parents, cmd.name()]));
  return {
    name,
    aliases: cmd.aliases(),
    usage: [name, usageArgs, options.length > 0 ? '[options]' : '']
      .filter(Boolean)
      .join(' '),
    summary,
    description,
    examples,
    arguments: args,
    options,
    subcommands,
  };
}

function formatDefault(value: unknown) {
  if (value === undefined || value === null || value === false) {
    return undefined;
  }
  return JSON.stringify(value);
}

async function generateCliReference(): Promise<CliReference> {
  const programs: CliReference['programs'] = [];
  for (const source of CLI_SOURCES) {
    const {pkg, program} = await captureProgram(source);
    const root = toCliCommand(program, []);
    programs.push({
      bin: source.bin,
      packageName: pkg.name,
      version: pkg.version,
      // A program without subcommands (e.g. `create-root`) is documented as a
      // single command.
      commands: root.subcommands.length > 0 ? root.subcommands : [root],
      globalOptions: root.subcommands.length > 0 ? root.options : [],
    });
  }
  return {programs};
}

// API reference.

interface ApiSource {
  /** Package dir, relative to `packages/`. */
  pkg: string;
  /** Export paths to leave out, e.g. ones that only re-export another path. */
  exclude?: string[];
}

const API_SOURCES: ApiSource[] = [
  // `./core` is the same entry point as `.`, and `./client` only references
  // Vite's client types.
  {pkg: 'root', exclude: ['./core', './client']},
  {pkg: 'root-cms', exclude: ['./core']},
  {pkg: 'root-password-protect'},
];

const printer = ts.createPrinter({removeComments: true});

function getTypesPath(pkgDir: string, value: string | {types?: string}) {
  if (typeof value === 'string') {
    return value.endsWith('.d.ts') ? path.join(pkgDir, value) : null;
  }
  return value?.types ? path.join(pkgDir, value.types) : null;
}

function getKind(decl: ts.Declaration): ApiExport['kind'] {
  if (ts.isFunctionDeclaration(decl)) {
    return 'function';
  }
  if (ts.isClassDeclaration(decl)) {
    return 'class';
  }
  if (ts.isInterfaceDeclaration(decl)) {
    return 'interface';
  }
  if (ts.isTypeAliasDeclaration(decl)) {
    return 'type';
  }
  if (ts.isEnumDeclaration(decl)) {
    return 'enum';
  }
  if (ts.isModuleDeclaration(decl) || ts.isSourceFile(decl)) {
    return 'namespace';
  }
  return 'variable';
}

/** Prints a declaration without comments or the `export`/`declare` keywords. */
function printDeclaration(decl: ts.Node, sourceFile: ts.SourceFile) {
  let node = decl;
  // Print the whole `declare const x: T;` statement for variables.
  if (ts.isVariableDeclaration(decl)) {
    node = decl.parent.parent;
  }
  return printer
    .printNode(ts.EmitHint.Unspecified, node, sourceFile)
    .replace(/^export (default )?/, '')
    .replace(/^declare /, '');
}

/**
 * Prints the head of a class or interface (name, type params and heritage),
 * since its members are documented separately.
 */
function printHead(
  decl: ts.ClassDeclaration | ts.InterfaceDeclaration,
  sourceFile: ts.SourceFile
) {
  const keyword = ts.isClassDeclaration(decl) ? 'class' : 'interface';
  const name = decl.name?.getText(sourceFile) || '';
  const typeParams = decl.typeParameters
    ? `<${decl.typeParameters.map((p) => p.getText(sourceFile)).join(', ')}>`
    : '';
  const heritage = (decl.heritageClauses || [])
    .map((clause) => ' ' + clause.getText(sourceFile))
    .join('');
  return `${keyword} ${name}${typeParams}${heritage}`;
}

function getDocs(symbol: ts.Symbol, checker: ts.TypeChecker) {
  const doc = ts.displayPartsToString(symbol.getDocumentationComment(checker));
  const tags = symbol.getJsDocTags(checker);
  const examples = tags
    .filter((tag) => tag.name === 'example')
    .map((tag) => stripCodeFence(ts.displayPartsToString(tag.text)));
  const deprecatedTag = tags.find((tag) => tag.name === 'deprecated');
  return {
    doc: doc.trim(),
    examples,
    deprecated: deprecatedTag
      ? ts.displayPartsToString(deprecatedTag.text) || true
      : undefined,
  };
}

/** Removes a surrounding markdown code fence from an `@example`. */
function stripCodeFence(text: string) {
  return text
    .trim()
    .replace(/^```\w*\n/, '')
    .replace(/\n```$/, '')
    .trim();
}

function getMembers(
  decl: ts.ClassDeclaration | ts.InterfaceDeclaration,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile
): ApiMember[] {
  const members: ApiMember[] = [];
  for (const member of decl.members) {
    if (!member.name || ts.isPrivateIdentifier(member.name)) {
      continue;
    }
    const modifiers = ts.canHaveModifiers(member)
      ? ts.getModifiers(member) || []
      : [];
    if (
      modifiers.some(
        (mod) =>
          mod.kind === ts.SyntaxKind.PrivateKeyword ||
          mod.kind === ts.SyntaxKind.ProtectedKeyword
      )
    ) {
      continue;
    }
    const name = member.name.getText(sourceFile);
    // Skip TS's emitted `private constructor` placeholders and `#private`.
    if (name.startsWith('#')) {
      continue;
    }
    const symbol = checker.getSymbolAtLocation(member.name);
    const docs = symbol
      ? getDocs(symbol, checker)
      : {doc: '', examples: [], deprecated: undefined};
    members.push({
      name,
      signature: printer
        .printNode(ts.EmitHint.Unspecified, member, sourceFile)
        .trim(),
      ...docs,
    });
  }
  return members;
}

function toApiExport(
  name: string,
  symbol: ts.Symbol,
  checker: ts.TypeChecker
): ApiExport | null {
  const target =
    symbol.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(symbol)
      : symbol;
  const decls = target.getDeclarations() || [];
  if (decls.length === 0) {
    return null;
  }
  const first = decls[0];
  const sourceFile = first.getSourceFile();
  const kind = getKind(first);
  const docs = getDocs(target, checker);
  const result: ApiExport = {name, kind, signature: '', members: [], ...docs};

  if (kind === 'namespace') {
    const nsExports = checker.getExportsOfModule(target);
    result.signature = `namespace ${name}`;
    result.members = nsExports
      .map((child) => toApiExport(child.getName(), child, checker))
      .filter((child): child is ApiExport => Boolean(child))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((child) => ({
        name: `${name}.${child.name}`,
        signature: child.signature,
        doc: child.doc,
        examples: child.examples,
        deprecated: child.deprecated,
      }));
    return result;
  }

  if (ts.isClassDeclaration(first) || ts.isInterfaceDeclaration(first)) {
    result.signature = printHead(first, sourceFile);
    // Interfaces can be declared more than once (declaration merging).
    for (const decl of decls) {
      if (ts.isClassDeclaration(decl) || ts.isInterfaceDeclaration(decl)) {
        result.members.push(...getMembers(decl, checker, decl.getSourceFile()));
      }
    }
    return result;
  }

  // Functions can have several overloads.
  result.signature = decls
    .map((decl) => printDeclaration(decl, decl.getSourceFile()))
    .join('\n');
  return result;
}

async function generateApiReference(): Promise<ApiReference> {
  const packages: ApiReference['packages'] = [];
  for (const source of API_SOURCES) {
    const pkgDir = path.join(PACKAGES_DIR, source.pkg);
    const pkg = readPackageJson(pkgDir);
    const entries: Array<{exportPath: string; typesPath: string}> = [];
    for (const [exportPath, value] of Object.entries(pkg.exports || {})) {
      if (source.exclude?.includes(exportPath)) {
        continue;
      }
      const typesPath = getTypesPath(pkgDir, value);
      if (typesPath) {
        entries.push({exportPath, typesPath});
      }
    }

    const program = ts.createProgram(
      entries.map((entry) => entry.typesPath),
      {
        noEmit: true,
        skipLibCheck: true,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        jsxImportSource: 'preact',
      }
    );
    const checker = program.getTypeChecker();

    const entryPoints: ApiEntryPoint[] = [];
    for (const entry of entries) {
      const sourceFile = program.getSourceFile(entry.typesPath);
      if (!sourceFile) {
        throw new Error(`missing types: ${entry.typesPath}. run pnpm build.`);
      }
      const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
      const exports = moduleSymbol
        ? checker.getExportsOfModule(moduleSymbol)
        : [];
      const importPath =
        entry.exportPath === '.'
          ? pkg.name
          : `${pkg.name}/${entry.exportPath.replace(/^\.\//, '')}`;
      entryPoints.push({
        importPath,
        doc: getModuleDoc(sourceFile),
        exports: exports
          .map((symbol) => toApiExport(symbol.getName(), symbol, checker))
          .filter((item): item is ApiExport => Boolean(item))
          .sort((a, b) => a.name.localeCompare(b.name)),
      });
    }
    packages.push({name: pkg.name, version: pkg.version, entryPoints});
  }
  return {packages};
}

/** Returns the text of a `@module` doc comment at the top of a file. */
function getModuleDoc(sourceFile: ts.SourceFile) {
  const text = sourceFile.getFullText();
  const match = text.match(/^\s*\/\*\*([\s\S]*?)\*\//);
  if (!match || !match[1].includes('@module')) {
    return '';
  }
  return match[1]
    .split('\n')
    .map((line) => line.replace(/^\s*\*\s?/, ''))
    .filter((line) => !line.startsWith('@module'))
    .join('\n')
    .trim();
}

async function main() {
  await mkdir(OUT_DIR, {recursive: true});

  const cli = await generateCliReference();
  await writeFile(
    path.join(OUT_DIR, 'cli.json'),
    JSON.stringify(cli, null, 2) + '\n'
  );
  const commandCount = cli.programs.reduce(
    (count, program) => count + program.commands.length,
    0
  );
  console.log(`wrote reference/cli.json (${commandCount} commands)`);

  const api = await generateApiReference();
  for (const pkg of api.packages) {
    const fileName = `api-${pkg.name.split('/').pop()}.json`;
    await writeFile(
      path.join(OUT_DIR, fileName),
      JSON.stringify({packages: [pkg]}, null, 2) + '\n'
    );
    const exportCount = pkg.entryPoints.reduce(
      (count, entry) => count + entry.exports.length,
      0
    );
    console.log(`wrote reference/${fileName} (${exportCount} exports)`);
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
