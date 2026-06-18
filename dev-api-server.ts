import { createServer } from 'http';
import { readFileSync } from 'fs';
import { computeLiveAdherence } from './shared/computeLiveAdherence.js';
import { getLiveRouteConfig } from './shared/livePollingConfig.js';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; })
);
Object.assign(process.env, env);

const server = createServer(async (req: any, res: any) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/live-adherence') {
    const agency = url.searchParams.get('agency');
    const route = url.searchParams.get('route');
    if (!agency || !route || !getLiveRouteConfig(agency, route)) {
      res.writeHead(400); res.end(JSON.stringify({ error: 'Invalid agency/route' })); return;
    }
    try {
      const data = await computeLiveAdherence(agency, route);
      if (!data || data.arrivals.length === 0) { res.end(JSON.stringify({ noData: true })); return; }
      res.end(JSON.stringify(data));
    } catch (e: any) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }
  } else {
    res.writeHead(404); res.end('{}');
  }
});

server.listen(3001, () => console.log('API ready at http://localhost:3001'));
