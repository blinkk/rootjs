import {Command} from 'commander';
import {bgGreen, black} from 'kleur/colors';
import {build} from './build';
import {createPackage} from './create-package';
import {dev, createDevServer} from './dev';
import {preview, createPreviewServer} from './preview';
import {start, createProdServer} from './start';

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
      .action(build);
    program
      .command('create-package [path]')
      .alias('package')
      .description(
        'creates a standalone npm package for deployment to various hosting services'
      )
      .option('--target <target>', 'hosting target, i.e. appengine or firebase')
      .option('--out <outdir>', 'output dir')
      .option('--mode <mode>', 'deployment mode, i.e. production or preview')
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
      .action(dev);
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

export {
  CliRunner,
  build,
  createPackage,
  dev,
  createDevServer,
  preview,
  createPreviewServer,
  start,
  createProdServer,
};
