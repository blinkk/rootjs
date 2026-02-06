import {Handler} from '@blinkk/root';

/**
 * API route that returns a JSON response.
 * This route demonstrates plugin-defined API endpoints.
 */
export const handle: Handler = (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(
    JSON.stringify({
      success: true,
      message: 'Hello from API route!',
      timestamp: '2026-02-02T00:00:00.000Z',
    })
  );
};
