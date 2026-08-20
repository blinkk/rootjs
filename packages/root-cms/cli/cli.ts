import {Command} from 'commander';
import {bgGreen, black} from 'kleur/colors';
import {clientCall, clientMethods} from './client-cli.js';
import {docsGet, docsSet, docsDownload, docsUpload} from './docs.js';
import {exportData} from './export.js';
import {generateTypes} from './generate-types.js';
import {importData} from './import.js';
import {initFirebase} from './init-firebase.js';
import {proposalApply, proposalCheck, proposalDiff} from './proposal.js';
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
      // The `client.*` and `proposal.*` commands emit machine-readable JSON
      // on stdout, so skip the decorative banner to keep their output clean
      // for AI agents.
      const name = actionCommand.name();
      if (name.startsWith('client.') || name.startsWith('proposal.')) {
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
      .command('proposal.check <file>')
      .description(
        'checks a CMS change proposal without touching the database\n\n' +
          'Parses the YAML, checks it against the proposal format, and prints\n' +
          'a summary of the changes it describes. Collection schemas are not\n' +
          'checked here (that needs db access — use proposal.diff). Exits\n' +
          'non-zero on any error, so it works as a CI gate on a pull request.\n\n' +
          'Usage examples:\n' +
          '  $ root-cms proposal.check cms-proposals/hero-refresh.yaml'
      )
      .action(proposalCheck);
    program
      .command('proposal.diff <file>')
      .description(
        'resolves a proposal against the live database and reports what it\n' +
          'would write, without writing anything\n\n' +
          'Usage examples:\n' +
          '  $ root-cms proposal.diff cms-proposals/hero-refresh.yaml'
      )
      .option('--skip-validation', 'skip collection schema validation')
      .action(proposalDiff);
    program
      .command('proposal.apply <file>')
      .description(
        'applies a CMS change proposal to the database\n\n' +
          'Writes drafts, release contents, and draft translations only —\n' +
          'never publishes, schedules, or deletes. Nothing is written unless\n' +
          'every change in the proposal resolves cleanly.\n\n' +
          "By default a proposal's recorded `before` values are treated as\n" +
          'documentation for the human reviewer and are not checked against\n' +
          'the database. Pass --verify-before to fail on drift instead.\n\n' +
          'Usage examples:\n' +
          '  $ root-cms proposal.apply cms-proposals/hero-refresh.yaml\n' +
          '  $ root-cms proposal.apply cms-proposals/hero-refresh.yaml --dry-run\n' +
          '  $ root-cms proposal.apply cms-proposals/hero-refresh.yaml --verify-before'
      )
      .option('--dry-run', 'resolve and validate everything, but write nothing')
      .option(
        '--verify-before',
        'fail if a recorded `before` value no longer matches the database'
      )
      .option('--skip-validation', 'skip collection schema validation')
      .option('--modified-by <email>', 'email attributed as the author')
      .action(proposalApply);
    program
      .command('skill.install [dir]')
      .description(
        'installs the bundled agent skills\n\n' +
          'Copies the skills (which teach AI coding agents how to use the\n' +
          '`root-cms client.*` commands, and how to propose and apply CMS\n' +
          'change proposals) into a local skills directory.\n\n' +
          'When no directory is given, existing agent skills directories are\n' +
          'auto-detected (e.g. `.claude/skills`, `.agent/skills`, or any\n' +
          '`.*/skills` dir already in the project) so Root does not assume a\n' +
          'specific AI provider. If none is found, it installs to\n' +
          '`.agent/skills`.\n\n' +
          'Usage examples:\n' +
          '  $ root-cms skill.install\n' +
          '  $ root-cms skill.install ./my-agent/skills\n' +
          '  $ root-cms skill.install --skill root-cms-propose\n' +
          '  $ root-cms skill.install --force'
      )
      .option('--force', 'overwrite the skill if it is already installed')
      .option('--skill <name>', 'install only the named skill')
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
  proposalApply,
  proposalCheck,
  proposalDiff,
};
