/**
 * Local dev API server — proxied by Vite at /api/* → localhost:5001.
 * The Live endpoints live in local-api/, outside api/, so they never deploy as Vercel functions.
 * Run alongside `npm run dev` via `npm run dev:api`
 */
import { createServer } from 'http';
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve('.env.local') });
// CIV-2072: the Live feed keys (only those) come from the main checkout's .env.local when this checkout has none.
const { loadLiveFeedKeys } = await import('./local-api/liveFeedKeys.js');
loadLiveFeedKeys();

const API_PORT = Number(process.env.ATLAS_API_PORT ?? 5001);

const handlers: Record<string, (req: Request) => Promise<Response>> = {};

async function loadHandlers() {
  const { default: liveVehicles } = await import('./local-api/live-vehicles.js');
  const { default: historyAdherence } = await import('./local-api/history-adherence.js');
  const { default: cartoTiles } = await import('./local-api/carto-tiles.js');
  const { default: liveStop } = await import('./local-api/live-stop.js');
  const { privacyRegionResponse } = await import('./shared/privacyRegion.js');
  const { default: liveSegments } = await import('./local-api/live-segments.js');
  const { default: liveRecent } = await import('./local-api/live-recent.js');
  const { default: liveDashboard } = await import('./local-api/live-dashboard.js');
  handlers['/api/live-segments'] = liveSegments.fetch;
  handlers['/api/live-recent'] = liveRecent.fetch;
  handlers['/api/live-dashboard'] = liveDashboard.fetch;
  const { default: liveAgency } = await import('./local-api/live-agency.js');
  const { default: liveStrings } = await import('./local-api/live-strings.js');
  handlers['/api/live-strings'] = liveStrings.fetch;
  handlers['/api/live-agency'] = liveAgency.fetch;
  const { default: liveStudioAgencies } = await import('./local-api/live-studio-agencies.js');
  handlers['/api/live-studio-agencies'] = liveStudioAgencies.fetch;
  const { default: liveGaps } = await import('./local-api/live-gaps.js');
  handlers['/api/live-gaps'] = liveGaps.fetch;
  handlers['/api/live-vehicles'] = liveVehicles.fetch;
  handlers['/api/history-adherence'] = historyAdherence.fetch;
  handlers['/api/live-stop'] = liveStop.fetch;
  handlers['/api/carto-tiles'] = cartoTiles.fetch;
  const { default: mcpCoverage } = await import('./local-api/mcp-coverage.js');
  handlers['/api/mcp-coverage'] = mcpCoverage.fetch;
  const { default: mcpTesters } = await import('./local-api/mcp-testers.js');
  handlers['/api/mcp-testers'] = mcpTesters.fetch;
  const { default: routeNow } = await import('./local-api/route-now.js');
  handlers['/api/route-now'] = routeNow.fetch;
  handlers['/api/privacy-region'] = privacyRegionResponse;
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
    const body = Buffer.from(await response.arrayBuffer());
    response.headers.forEach((value, name) => res.setHeader(name, value));
    res.writeHead(response.status);
    res.end(body);
  } catch (err) {
    // The detail stays in this server's log; the client gets a fixed message (code scanning alert #55).
    console.error('[api-dev-server]', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
}).listen(API_PORT, () => {
  console.log(`API dev server listening on http://localhost:${API_PORT}`);
  console.log('Routes: /api/live-vehicles, /api/live-segments, /api/live-dashboard, /api/live-agency, /api/live-studio-agencies, /api/live-gaps, /api/live-strings, /api/live-recent, /api/history-adherence, /api/live-stop, /api/carto-tiles (dev basemap), /api/privacy-region');
});
