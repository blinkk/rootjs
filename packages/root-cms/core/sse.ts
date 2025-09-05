/**
 * Library for handling server-sent events.
 * https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
 */

import {Server, Request, Response} from '@blinkk/root';
import {SSEEvent} from '../shared/sse.js';

export type SSEBroadcastFn = (event: string, data?: any) => void;
export type SSEClient = Response;

export function sse(server: Server) {
  const sseClients = new Set<SSEClient>();

  /** Broadcasts events to all connected `sseClients`. */
  const sseBroadcast: SSEBroadcastFn = (event: string, data?: any) => {
    const lines = [`event: ${event}`];
    if (data) {
      lines.push(`data: ${JSON.stringify(data)}`);
    }
    const message = lines.join('\n') + '\n\n';
    sseClients.forEach((res: Response) => {
      try {
        res.write(message);
      } catch (error) {
        // Remove failed connections.
        sseClients.delete(res);
      }
    });
  };

  server.use('/cms/api/sse.connect', async (req: Request, res: Response) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    });
    sseClients.add(res);
    console.log('[sse] client connected');
    res.write(`event: ${SSEEvent.CONNECTED}\n\n\n`);
    req.on('close', () => {
      sseClients.delete(res);
    });
    req.on('aborted', () => {
      sseClients.delete(res);
    });
  });

  return {sseBroadcast};
}
