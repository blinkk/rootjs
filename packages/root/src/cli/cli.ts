import {Command, InvalidArgumentError} from 'commander';
import {bgGreen, black} from 'kleur/colors';
import {build, BuildOptions} from './build.js';
import {codegen} from './codegen.js';
import {createPackage} from './create-package.js';
import {dev, createDevServer} from './dev.js';
import {gaeDeploy} from './gae-deploy.js';
import {preview, createPreviewServer} from './preview.js';
import {start, createProdServer} from './start.js';

class CliRunner {
  private name: string;
  private version: string;

  constructor(name: string, version: string) {
    this.name = name;
    this.version = version;
  }

  async run(argv: string[]) {
    const program = new Command('root');
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
      .command('build [path]')
      .description('generates a static build')
      .option('--ssr-only', 'produce a ssr-only build')
      .option(
        '--mode <mode>',
        'see: https://vitejs.dev/guide/env-and-mode.html#modes',
        'production'
      )
      .option(
        '-c, --concurrency <num>',
        'number of files to build concurrently',
        '10'
      )
      .option(
        '--filter <urlPathRegex>',
        'builds the url paths that match the given regex, e.g. "/products/.*"',
        ''
      )
      .action(build);
    program
      .command('codegen [type] [name]')
      .description('generates boilerplate code')
      .option('--out <outdir>', 'output dir')
      .action(codegen);
    program
      .command('create-package [path]')
      .alias('package')
      .description(
        'creates a standalone npm package for deployment to various hosting services'
      )
      .option('--target <target>', 'hosting target, i.e. appengine or firebase')
      .option('--out <outdir>', 'output dir')
      .option('--mode <mode>', 'deployment mode, i.e. production or preview')
      .option(
        '--app-yaml <path>',
        'for appengine targets, path to app.yaml (defaults to "app.yaml")'
      )
      .action((rootPackageDir, options) => {
        options.version = this.version;
        createPackage(rootPackageDir, options);
      });
    program
      .command('dev [path]')
      .description('starts the server in development mode')
      .option(
        '--host <host>',
        'network address the server should listen on, e.g. 127.0.0.1'
      )
      .option('--mcp', 'start an MCP server for AI tool integration')
      .action((rootPackageDir, options) => {
        options.version = this.version;
        dev(rootPackageDir, options);
      });
    program
      .command('gae-deploy <appdir>')
      .description(
        'appengine deploy utility that can optionally run healthchecks before diverting traffic to the new version and clean up old versions'
      )
      .option('--project <project>', 'GCP project id')
      .option('--prefix <prefix>', 'prefix to append the version')
      .option(
        '--promote',
        'whether to promote the version (if healthchecks pass)'
      )
      .option(
        '--healthcheck-url <url>',
        'healthcheck url path (e.g. "/healthcheck") which should return a 200 status with the text "OK"'
      )
      .option(
        '--max-versions <num>',
        'the max number of versions to keep',
        numberFlag
      )
      .action(gaeDeploy);
    program
      .command('preview [path]')
      .description('starts the server in preview mode')
      .option(
        '--host <host>',
        'network address the server should listen on, e.g. 127.0.0.1'
      )
      .action(preview);
    program
      .command('start [path]')
      .description('starts the server in production mode')
      .option(
        '--host <host>',
        'network address the server should listen on, e.g. 127.0.0.1'
      )
      .action(start);
    await program.parseAsync(argv);
  }
}

function numberFlag(value: string) {
  const num = parseInt(value);
  if (isNaN(num)) {
    throw new InvalidArgumentError(`not a number: ${value}`);
  }
  return num;
}

export {
  CliRunner,
  build,
  BuildOptions,
  createPackage,
  dev,
  createDevServer,
  preview,
  createPreviewServer,
  start,
  createProdServer,
};
