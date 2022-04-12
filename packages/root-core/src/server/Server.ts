import fastify from 'fastify';
import {Application} from './Application';
import Workspace from '../workspace/Workspace';
import {api} from './plugins/api';
import {requestExtras} from './plugins/requestExtras';
import {webui} from './plugins/webui';

export interface ServerConfig {
  workspace: Workspace;
}

export class Server {
  private app: Application;

  constructor({workspace}: ServerConfig) {
    console.log(require.resolve('@blinkk/root-webui'));
    this.app = fastify({trustProxy: true});
    this.app.register(requestExtras, {workspace});
    this.app.register(api, {workspace});
    this.app.register(webui);
  }

  /**
   * Starts the server.
   */
  async listen() {
    // https://www.fastify.io/docs/latest/Guides/Serverless/#google-cloud-run
    const IS_GOOGLE_CLOUD_RUN = process.env.K_SERVICE !== undefined;
    const port = process.env.PORT || 4000;
    const address = IS_GOOGLE_CLOUD_RUN ? '0.0.0.0' : undefined;
    await this.app.listen(port, address);
    console.log(`listening on ${address || ''}:${port}`);
  }
}
