/**
 * Library for handling server-sent events.
 */

import {Server, Request, Response} from '@blinkk/root';

export function sse(server: Server) {
  // Server-sent events.
  const sseClients = new Set<Response>();

  /** Broadcasts events to all connected `sseClients`. */
  function sseBroadcast(data: any) {
    const sseData = `data: ${JSON.stringify(data)}\n\n`;
    sseClients.forEach((res: Response) => {
      try {
        res.write(sseData);
      } catch (error) {
        // Remove failed connections.
        sseClients.delete(res);
      }
    });
  }

  server.use('/cms/api/sse.connect', async (req: Request, res: Response) => {
    // Set SSE headers.
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    });

    // Add connection to our set.
    sseClients.add(res);

    // Send initial connection message.
    res.write(
      `data: ${JSON.stringify({
        type: 'connection',
        message: 'Connected to file watcher',
        timestamp: new Date().toISOString(),
      })}\n\n`
    );

    // Handle client disconnect.
    req.on('close', () => {
      sseClients.delete(res);
      console.log('SSE client disconnected');
    });

    req.on('aborted', () => {
      sseClients.delete(res);
      console.log('SSE client aborted');
    });
  });

  return {sseBroadcast};
}
