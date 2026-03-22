/**
 * Library for handling server-sent events.
 * https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
 */

import {Server, Request, Response} from '@blinkk/root';
import {SSEConnectedEvent, SSEEvent} from '../shared/sse.js';
import {getServerVersion} from './server-version.js';

export type SSEBroadcastFn = (event: string, data?: any) => void;
export type SSEClient = Response;

export function sse(server: Server) {
  const sseClients = new Set<SSEClient>();

  /** Broadcasts events to all connected `sseClients`. */
  const sseBroadcast: SSEBroadcastFn = (event: string, data?: any) => {
    const message = formatMessage(event, data);
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
    if (!req.user) {
      res.status(401).json({success: false, error: 'NOT_AUTHORIZED'});
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    });
    sseClients.add(res);
    const connectedMessage = formatMessage<SSEConnectedEvent>(
      SSEEvent.CONNECTED,
      // Send the server version to notify clients if their current version is
      // out-of-date.
      {serverVersion: getServerVersion()}
    );
    res.write(connectedMessage);

    // Send periodic heartbeat comments to keep the connection alive through
    // intermediate proxies.
    const heartbeatInterval = setInterval(() => {
      try {
        res.write(':heartbeat\n\n');
      } catch {
        clearInterval(heartbeatInterval);
      }
    }, 30_000);

    // Proactively close the connection before GAE's request deadline (~10 min)
    // to avoid 500 errors. The client will automatically reconnect.
    const maxConnectionTimer = setTimeout(() => {
      clearInterval(heartbeatInterval);
      try {
        // Tell the client to reconnect after a short delay.
        res.write('retry: 1000\n\n');
        res.end();
      } catch {
        // Connection may already be closed.
      }
      sseClients.delete(res);
    }, 9 * 60_000);

    const cleanup = () => {
      clearInterval(heartbeatInterval);
      clearTimeout(maxConnectionTimer);
      sseClients.delete(res);
    };
    req.on('close', cleanup);
    req.on('aborted', cleanup);
  });

  return {sseBroadcast};
}

function formatMessage<T = unknown>(event: string, data?: T) {
  const lines = [`event: ${event}`];
  if (data) {
    lines.push(`data: ${JSON.stringify(data)}`);
  }
  const message = lines.join('\n') + '\n\n';
  return message;
}
