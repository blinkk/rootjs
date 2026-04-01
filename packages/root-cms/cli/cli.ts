import {Command} from 'commander';
import {bgGreen, black} from 'kleur/colors';
import {
  docsGet,
  docsSet,
  docsUpdate,
  docsDownload,
  docsUpload,
} from './docs.js';
import {exportData} from './export.js';
import {generateTypes} from './generate-types.js';
import {importData} from './import.js';
import {initFirebase} from './init-firebase.js';

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
    program.hook('preAction', (cmd) => {
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
      .command('docs.update <docId> <fieldPath> [value]')
      .description(
        'updates a single field in a draft doc by its key path\n\n' +
          'The value can be provided as an inline JSON argument, from a file\n' +
          'via --file, or piped via stdin.\n\n' +
          'Validates the updated document against the collection schema by default.\n' +
          'Use --no-validate to skip validation.\n\n' +
          'Key paths use dot notation. For array fields, use 0-based\n' +
          'numeric indices to target a specific item within the array.\n\n' +
          'Usage examples:\n' +
          '  $ root-cms docs.update Pages/home hero.title \'"New Title"\'\n' +
          '  $ root-cms docs.update Pages/home meta.count 42\n' +
          '  $ root-cms docs.update Pages/home hero.image --file image.json\n' +
          '  $ cat value.json | root-cms docs.update Pages/home hero.title\n' +
          '  $ root-cms docs.update Pages/home hero.title \'"New Title"\' --no-validate\n\n' +
          'Array field examples:\n' +
          '  # Update the title of the first item in an array field called "sections":\n' +
          '  $ root-cms docs.update Pages/home sections.0.title \'"Introduction"\'\n\n' +
          '  # Update the entire second item in the array:\n' +
          '  $ root-cms docs.update Pages/home sections.1 \'{"title": "About", "body": "..."}"\'\n\n' +
          '  # Update a deeply nested value inside an array item:\n' +
          '  $ root-cms docs.update Pages/home sections.0.cta.label \'"Learn more"\''
      )
      .option('--file <filepath>', 'read the value from a JSON file')
      .option('--no-validate', 'skip schema validation')
      .action(docsUpdate);
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
    await program.parseAsync(argv);
  }
}

export {
  CliRunner,
  docsGet,
  docsSet,
  docsUpdate,
  docsDownload,
  docsUpload,
  exportData,
  generateTypes,
  importData,
  initFirebase,
};
