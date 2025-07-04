import {Server, Request, Response} from '@blinkk/root';
import {multipartMiddleware} from '@blinkk/root/middleware';
import {Chat, ChatClient} from './ai.js';
import {RootCMSClient} from './client.js';
import {runCronJobs} from './cron.js';
import {arrayToCsv, csvToArray} from './csv.js';

type AppModule = typeof import('./app.js');

export interface ApiOptions {
  getRenderer: (req: Request) => Promise<AppModule>;
}

/**
 * Registers API middleware handlers.
 */
export function api(server: Server, options: ApiOptions) {
  /**
   * Returns the schema for a collection.
   *
   * Example:
   *
   * ```
   * POST /cms/api/collection.get
   * {"name": "BlogPosts"}
   * ```
   *
   * =>
   *
   * ```
   * {
   *   "success": true,
   *   "data": {"name": "BlogPosts", "description": "...", "fields": [...]}
   * }
   * ```
   */
  server.use('/cms/api/collection.get', async (req: Request, res: Response) => {
    if (
      req.method !== 'POST' ||
      !String(req.get('content-type')).startsWith('application/json')
    ) {
      res.status(400).json({success: false, error: 'BAD_REQUEST'});
      return;
    }

    const reqBody = req.body || {};
    if (!reqBody.collectionId) {
      res.status(400).json({success: false, error: 'MISSING_COLLECTION_ID'});
      return;
    }

    try {
      const app = await options.getRenderer(req);
      const collections = app.getCollections();
      const collection = collections[reqBody.collectionId];
      if (!collection) {
        res.status(404).json({success: false, error: 'NOT_FOUND'});
        return;
      }
      res.status(200).json({success: true, data: collection});
    } catch (err) {
      console.error(err.stack || err);
      res.status(500).json({success: false, error: 'UNKNOWN'});
    }
  });

  /**
   * Runs CMS cron jobs.
   */
  server.use('/cms/api/cron.run', async (req: Request, res: Response) => {
    try {
      await runCronJobs(req.rootConfig!);
      res.status(200).json({success: true});
    } catch (err) {
      console.error(err);
      res.status(500).json({success: false});
    }
  });

  /**
   * Accepts a JSON object containing {headers: [...], rows: [...]} and sends
   * an HTTP response with a corresponding CSV file as an attachment.
   *
   * Sample request:
   *
   * ```json
   * {
   *   "headers": ["foo"],
   *   "rows": [
   *     {"foo": "bar"},
   *     {"foo": "baz"},
   *   ]
   * }
   * ```
   */
  server.use('/cms/api/csv.download', (req: Request, res: Response) => {
    if (
      req.method !== 'POST' ||
      !String(req.get('content-type')).startsWith('application/json')
    ) {
      res.status(400).json({success: false, error: 'BAD_REQUEST'});
      return;
    }

    try {
      const body = req.body || {};
      const headers = body.headers || [];
      const rows = body.rows || [];
      const csv = arrayToCsv({headers, rows});
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="data.csv"');
      res.status(200).end(csv);
    } catch (err) {
      console.error(err.stack || err);
      res.status(500).json({success: false, error: 'UNKNOWN'});
    }
  });

  /**
   * Imports a CSV file and returns a JSON array of objects representing the
   * CSV.
   *
   * Sample response:
   *
   * ```json
   * {
   *   "success": true,
   *   "data": [
   *     {"foo": "bar"},
   *     {"foo": "baz"},
   *   ]
   * }
   * ```
   */
  server.use(
    '/cms/api/csv.import',
    multipartMiddleware(),
    (req: Request, res: Response) => {
      if (req.method !== 'POST' || !req.files || !req.files.file) {
        res.status(400).json({success: false, error: 'BAD_REQUEST'});
        return;
      }

      try {
        const file = req.files.file;
        const csvString = file.buffer.toString('utf8');
        const rows = csvToArray(csvString);
        res.status(200).json({success: true, data: rows});
      } catch (err) {
        console.error(err.stack || err);
        res.status(500).json({success: false, error: 'UNKNOWN'});
      }
    }
  );

  /**
   * Runs a data source sync.
   */
  server.use('/cms/api/data.sync', async (req: Request, res: Response) => {
    if (
      req.method !== 'POST' ||
      !String(req.get('content-type')).startsWith('application/json')
    ) {
      res.status(400).json({success: false, error: 'BAD_REQUEST'});
      return;
    }

    if (!req.user?.email) {
      res.status(401).json({success: false, error: 'UNAUTHORIZED'});
    }

    const reqBody = req.body || {};
    const dataSourceId = reqBody.id;
    if (!dataSourceId) {
      res.status(400).json({success: false, error: 'MISSING_ID'});
      return;
    }
    const cmsClient = new RootCMSClient(req.rootConfig!);
    try {
      await cmsClient.syncDataSource(dataSourceId, {syncedBy: req.user!.email});
      res.status(200).json({success: true, id: dataSourceId});
    } catch (err) {
      console.error(err.stack || err);
      res.status(500).json({success: false, error: 'UNKNOWN'});
    }
  });

  /**
   * Logs an action.
   */
  server.use('/cms/api/actions.log', async (req: Request, res: Response) => {
    if (
      req.method !== 'POST' ||
      !String(req.get('content-type')).startsWith('application/json')
    ) {
      res.status(400).json({success: false, error: 'BAD_REQUEST'});
      return;
    }

    if (!req.user?.email) {
      res.status(401).json({success: false, error: 'UNAUTHORIZED'});
    }

    const reqBody = req.body || {};
    const action = reqBody.action;
    if (!action) {
      res.status(400).json({
        success: false,
        error: 'MISSING_REQUIRED_FIELD',
        field: 'action',
      });
    }
    const metadata = reqBody.metadata || {};

    const cmsClient = new RootCMSClient(req.rootConfig!);
    try {
      await cmsClient.logAction(action, {
        by: req.user?.email,
        metadata: metadata,
      });
      res.status(200).json({success: true});
    } catch (err) {
      console.error(err.stack || err);
      res.status(500).json({success: false, error: 'UNKNOWN'});
    }
  });

  /**
   * AI chatbot.
   */
  server.use('/cms/api/ai.chat', async (req: Request, res: Response) => {
    if (
      req.method !== 'POST' ||
      !String(req.get('content-type')).startsWith('application/json')
    ) {
      res.status(400).json({success: false, error: 'BAD_REQUEST'});
      return;
    }
    if (!req.user?.email) {
      res.status(401).json({success: false, error: 'UNAUTHORIZED'});
      return;
    }
    const reqBody = req.body || {};
    if (!reqBody.prompt) {
      res.status(400).json({success: false, error: 'MISSING_PROMPT'});
      return;
    }
    const prompt = reqBody.prompt;

    try {
      const cmsClient = new RootCMSClient(req.rootConfig!);
      const chatClient = new ChatClient(cmsClient, req.user.email);
      let chat: Chat;
      if (reqBody.chatId) {
        chat = await chatClient.getChat(reqBody.chatId);
      } else {
        chat = await chatClient.createChat();
      }
      const chatResponse = await chat.sendPrompt(prompt);
      res
        .status(200)
        .json({success: true, chatId: chat.id, response: chatResponse});
    } catch (err) {
      console.error(err.stack || err);
      res.status(500).json({success: false, error: 'UNKNOWN'});
    }
  });

  server.use('/cms/api/ai.list_chats', async (req: Request, res: Response) => {
    if (
      req.method !== 'POST' ||
      !String(req.get('content-type')).startsWith('application/json')
    ) {
      res.status(400).json({success: false, error: 'BAD_REQUEST'});
      return;
    }
    if (!req.user?.email) {
      res.status(401).json({success: false, error: 'UNAUTHORIZED'});
      return;
    }
    const reqBody = req.body || {};
    const limit = reqBody.limit;

    try {
      const cmsClient = new RootCMSClient(req.rootConfig!);
      const chatClient = new ChatClient(cmsClient, req.user.email);
      const chats = await chatClient.listChats({limit});
      res.status(200).json({success: true, chats});
    } catch (err) {
      console.error(err.stack || err);
      res.status(500).json({success: false, error: 'UNKNOWN'});
    }
  });
}
