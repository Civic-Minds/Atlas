/**
 * Local dev API server — proxied by Vite at /api/* → localhost:5001
 * Run alongside `npm run dev` via `npm run dev:api`
 */
import { createServer } from 'http';
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve('.env.local') });

const API_PORT = 5001;

const handlers: Record<string, (req: Request) => Promise<Response>> = {};

async function loadHandlers() {
  const { default: liveVehicles } = await import('./api/live-vehicles.js');
  const { default: liveAdherence } = await import('./api/live-adherence.js');
  const { default: historyAdherence } = await import('./api/history-adherence.js');
  const { default: gtfsRt } = await import('./api/gtfs-rt.js');
  handlers['/api/live-vehicles'] = liveVehicles;
  handlers['/api/live-adherence'] = liveAdherence;
  handlers['/api/history-adherence'] = historyAdherence;
  handlers['/api/gtfs-rt'] = gtfsRt;
}

await loadHandlers();

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${API_PORT}`);
  const pathname = url.pathname;
  const handler = handlers[pathname];

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (!handler) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `No handler for ${pathname}` }));
    return;
  }

  try {
    const request = new Request(`http://localhost:${API_PORT}${req.url}`, { method: req.method ?? 'GET' });
    const response = await handler(request);
    const body = await response.text();
    res.writeHead(response.status, { 'Content-Type': 'application/json' });
    res.end(body);
  } catch (err: any) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}).listen(API_PORT, () => {
  console.log(`API dev server listening on http://localhost:${API_PORT}`);
  console.log('Routes: /api/live-vehicles, /api/live-adherence, /api/history-adherence, /api/gtfs-rt');
});
