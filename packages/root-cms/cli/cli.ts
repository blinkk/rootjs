import {Command} from 'commander';
import {bgGreen, black} from 'kleur/colors';
import {clientCall, clientMethods} from './client-cli.js';
import {docsGet, docsSet, docsDownload, docsUpload} from './docs.js';
import {exportData} from './export.js';
import {generateTypes} from './generate-types.js';
import {importData} from './import.js';
import {initFirebase} from './init-firebase.js';
import {installSkill} from './skill.js';

class CliRunner {
  private name: string;
  private version: string;

  constructor(name: string, version: string) {
    this.name = name;
    this.version = version;
  }

  async run(argv: string[]) {
    const program = new Command(this.name);
    program.version(this.version);
    program.option('-q, --quiet', 'quiet');
    program.hook('preAction', (cmd, actionCommand) => {
      // The `client.*` commands emit machine-readable JSON on stdout, so skip
      // the decorative banner to keep their output clean for AI agents.
      if (actionCommand.name().startsWith('client.')) {
        return;
      }
      if (!cmd.opts().quiet) {
        console.log(
          `🥕 ${bgGreen(black(` ${this.name} `))} v${this.version}\n`
        );
      }
    });
    program
      .command('init-firebase')
      .alias('init')
      .description('inits the firebase project proper security rules')
      .option('--project <project>', 'gcp project id')
      .option('--admin <email>', 'adds an admin to the project')
      .action(initFirebase);
    program
      .command('generate-types')
      .alias('types')
      .description(
        'generates root-cms.d.ts from *.schema.ts files in the project'
      )
      .action(generateTypes);
    program
      .command('export')
      .description(
        'exports firestore data to a local directory\n\n' +
          'By default, all content in the Firestore database associated with the CMS will be exported.\n\n' +
          'A unique new directory will be created for each export.\n\n' +
          'File naming conventions:\n' +
          "- Documents that act as containers for subcollections are exported as directories containing a `__data.json` file for the document's own data.\n" +
          '- Standalone documents are exported as JSON files named after their document ID (e.g. `page.json`).\n' +
          '- For collections like ActionLogs and Translations, the document ID (often a hash) is used as the filename.\n\n' +
          'Usage examples:\n' +
          '  $ root-cms export\n' +
          '  $ root-cms export --filter "Collections/Pages/**"\n' +
          '  $ root-cms export --filter "Collections/Pages/**,!Collections/Pages/Draft/**"\n\n' +
          'Example output:\n' +
          '  <output>/Collections/Pages/Draft/...\n' +
          '  <output>/Collections/Pages/Published/...\n' +
          '  <output>/ActionLogs/...'
      )
      .option(
        '--filter <pattern>',
        'comma-separated list of glob patterns to filter content (e.g. Collections/Pages/**, !ActionLogs/**)'
      )
      .option('--site <siteId>', 'site id to export (overrides root config)')
      .option(
        '--database <databaseId>',
        'firestore database id (overrides root config, default: "(default)")'
      )
      .option('--project <projectId>', 'gcp project id (overrides root config)')
      .action(exportData);
    program
      .command('import')
      .description(
        'imports firestore data from a local directory\n\n' +
          'Usage examples:\n' +
          '  $ root-cms import --dir export_project_site_20251209t1305\n' +
          '  $ root-cms import --dir export_project_site_20251209t1305 --filter "Collections/Pages/**"'
      )
      .option('--dir <directory>', 'directory to import from (required)')
      .option(
        '--filter <pattern>',
        'comma-separated list of glob patterns to filter content (e.g. Collections/Pages/**, !ActionLogs/**)'
      )
      .option('--site <siteId>', 'site id to import to (overrides root config)')
      .option(
        '--database <databaseId>',
        'firestore database id (overrides root config, default: "(default)")'
      )
      .option('--project <projectId>', 'gcp project id (overrides root config)')
      .action(importData);
    program
      .command('docs.get <docId> [outputPath]')
      .description(
        'fetches a single doc and outputs it as JSON\n\n' +
          'If an output path is provided, writes to a file. Otherwise, writes to stdout.\n\n' +
          'Usage examples:\n' +
          '  $ root-cms docs.get Pages/home\n' +
          '  $ root-cms docs.get Pages/home ./out/home.json\n' +
          '  $ root-cms docs.get Pages/home --mode published\n' +
          '  $ root-cms docs.get Pages/home | jq .fields'
      )
      .option(
        '--mode <mode>',
        'doc mode: "draft" or "published" (default: "draft")'
      )
      .option('--raw', 'output raw firestore data without unmarshaling')
      .action(docsGet);
    program
      .command('docs.set <docId> [filepath]')
      .description(
        'updates a single doc from a JSON file or stdin\n\n' +
          'If a filepath is provided, reads from the file. Otherwise, reads from stdin.\n\n' +
          'Usage examples:\n' +
          '  $ root-cms docs.set Pages/home home.json\n' +
          '  $ root-cms docs.set Pages/home home.json --mode published\n' +
          '  $ cat data.json | root-cms docs.set Pages/home'
      )
      .option(
        '--mode <mode>',
        'doc mode: "draft" or "published" (default: "draft")'
      )
      .action(docsSet);
    program
      .command('docs.download <collection> [outputDir]')
      .description(
        'downloads all docs in a collection to a local directory\n\n' +
          'Usage examples:\n' +
          '  $ root-cms docs.download Pages\n' +
          '  $ root-cms docs.download Pages ./my-pages\n' +
          '  $ root-cms docs.download Pages --mode published'
      )
      .option(
        '--mode <mode>',
        'doc mode: "draft" or "published" (default: "draft")'
      )
      .action(docsDownload);
    program
      .command('docs.upload <collection> <dir>')
      .description(
        'uploads docs from a local directory to a collection\n\n' +
          'Usage examples:\n' +
          '  $ root-cms docs.upload Pages ./Pages\n' +
          '  $ root-cms docs.upload Pages ./my-pages --mode published'
      )
      .option(
        '--mode <mode>',
        'doc mode: "draft" or "published" (default: "draft")'
      )
      .action(docsUpload);
    program
      .command('client.call <method> [jsonArgs]')
      .description(
        'calls a method on the RootCMSClient with JSON-encoded arguments\n\n' +
          'Designed for AI agents. Arguments are a JSON array of positional\n' +
          'args passed on the command line. When jsonArgs is omitted the\n' +
          'method is called with no arguments; pass `-` to read the JSON args\n' +
          'from stdin. The result is printed to stdout as a JSON envelope:\n' +
          '  {"ok": true, "result": <value>}\n' +
          '  {"ok": false, "error": "<message>"}\n\n' +
          'Run `root-cms client.methods` to discover available methods and\n' +
          'their argument signatures.\n\n' +
          'Usage examples:\n' +
          '  $ root-cms client.call getDoc \'["Pages", "home", {"mode": "draft"}]\'\n' +
          '  $ root-cms client.call listDocs \'["Pages", {"mode": "published"}]\'\n' +
          '  $ root-cms client.call publishScheduledDocs\n' +
          '  $ echo \'["Pages", "home", {"mode": "draft"}]\' | root-cms client.call getDoc -'
      )
      .action(clientCall);
    program
      .command('client.methods')
      .description(
        'lists the methods available on the RootCMSClient\n\n' +
          'Designed for AI discovery of available functionality. Prints each\n' +
          "method's signature and description.\n\n" +
          'Usage examples:\n' +
          '  $ root-cms client.methods\n' +
          '  $ root-cms client.methods --json\n' +
          '  $ root-cms client.methods --json --types'
      )
      .option('--json', 'output machine-readable JSON')
      .option('--types', 'include referenced type/interface definitions')
      .action(clientMethods);
    program
      .command('skill.install [dir]')
      .description(
        'installs the bundled "root-cms-cli" agent skill\n\n' +
          'Copies the skill (which teaches AI coding agents how to use the\n' +
          '`root-cms client.*` commands) into a local skills directory.\n' +
          'Defaults to `.claude/skills`, creating `.claude/skills/root-cms-cli`.\n\n' +
          'Usage examples:\n' +
          '  $ root-cms skill.install\n' +
          '  $ root-cms skill.install ./my-agent/skills\n' +
          '  $ root-cms skill.install --force'
      )
      .option('--force', 'overwrite the skill if it is already installed')
      .action(installSkill);
    await program.parseAsync(argv);
  }
}

export {
  CliRunner,
  clientCall,
  clientMethods,
  docsGet,
  docsSet,
  docsDownload,
  docsUpload,
  exportData,
  generateTypes,
  importData,
  initFirebase,
  installSkill,
};
