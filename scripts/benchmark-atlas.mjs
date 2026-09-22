#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCENARIOS = [
  { name: 'ottawa-city', lat: '45.42150', lon: '-75.69720', z: '10.00' },
  { name: 'ontario-region', lat: '44.37898', lon: '-76.84144', z: '6.00' },
  { name: 'broad', lat: '44.37898', lon: '-76.84144', z: '3.59' },
];

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const hasFlag = name => process.argv.includes(`--${name}`);
const target = arg('target', process.env.ATLAS_BENCHMARK_TARGET ?? 'http://localhost:5100');
const runs = Number(arg('runs', process.env.ATLAS_BENCHMARK_RUNS ?? 5));
const timeoutMs = Number(arg('timeout', process.env.ATLAS_BENCHMARK_TIMEOUT_MS ?? 60000));
const network = arg('network', process.env.ATLAS_BENCHMARK_NETWORK ?? 'unspecified');
const device = arg('device', process.env.ATLAS_BENCHMARK_DEVICE ?? 'desktop');
const output = arg('output', process.env.ATLAS_BENCHMARK_OUTPUT ?? '');
const requestedScenario = arg('scenario', '');
const scenarios = requestedScenario ? SCENARIOS.filter(s => s.name === requestedScenario) : SCENARIOS;

if (!Number.isInteger(runs) || runs < 1) throw new Error('--runs must be a positive integer');
if (!scenarios.length) throw new Error(`Unknown scenario: ${requestedScenario}`);

function urlFor(scenario) {
  const params = new URLSearchParams({ h: '10', p: 'evening', lat: scenario.lat, lon: scenario.lon, z: scenario.z });
  if (hasFlag('data-saver')) params.set('dataSaver', '1');
  return `${target.replace(/\/$/, '')}/?${params}`;
}

function parseProgress(text) {
  const match = text.match(/(\d+)\/(\d+) networks/);
  return match ? { loaded: Number(match[1]), requested: Number(match[2]) } : null;
}

function percentile(values, rank) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((rank / 100) * sorted.length) - 1)];
}

function summarize(results) {
  const groups = results.reduce((map, result) => {
    const key = `${result.scenario}:${result.kind}`;
    (map[key] ??= []).push(result);
    return map;
  }, {});
  return Object.values(groups).map(group => {
    const complete = group.filter(result => result.status === 'complete').map(result => result.durationMs);
    return {
      scenario: group[0].scenario,
      kind: group[0].kind,
      runs: group.length,
      completed: complete.length,
      timeouts: group.length - complete.length,
      medianMs: percentile(complete, 50),
      p75Ms: percentile(complete, 75),
      p95Ms: percentile(complete, 95),
    };
  });
}

async function findChrome() {
  for (const candidate of [
    process.env.ATLAS_BENCHMARK_CHROME,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean)) {
    try { await fs.access(candidate); return candidate; } catch {}
  }
  return undefined;
}

async function measurePage(page, scenario, kind, run) {
  const url = urlFor(scenario);
  const wallStart = performance.now();
  const startedAt = Date.now();
  let lastProgress = null;
  let readyDetail = null;
  let readySource = null;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const state = await page.evaluate(() => ({
      body: document.body.innerText,
      marks: performance.getEntriesByName('atlas:network-data-ready', 'mark').map(entry => ({ startTime: entry.startTime, detail: entry.detail })),
    }));
    lastProgress = parseProgress(state.body) ?? lastProgress;
    if (state.marks.length) {
      const mark = state.marks.at(-1);
      readyDetail = mark.detail;
      readySource = 'network-data-ready';
      return {
        scenario: scenario.name, kind, run, url,
        durationMs: Math.round(mark.startTime),
        browserWallMs: Math.round(performance.now() - wallStart),
        readyDetail, readySource, lastProgress, status: 'complete',
      };
    }
    // Compatibility fallback for an older deployment without the readiness mark.
    if (/\d+\s+routes/.test(state.body) && !parseProgress(state.body) && Date.now() - startedAt >= 8000) {
      readySource = 'legacy-route-count';
      return {
        scenario: scenario.name, kind, run, url,
        durationMs: Math.round(performance.now() - wallStart),
        browserWallMs: Math.round(performance.now() - wallStart),
        readyDetail, readySource, lastProgress, status: 'complete',
      };
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return {
    scenario: scenario.name, kind, run, url,
    durationMs: Math.round(performance.now() - wallStart),
    browserWallMs: Math.round(performance.now() - wallStart),
    readyDetail, readySource, lastProgress, status: 'timeout',
  };
}

async function run() {
  const browser = await chromium.launch({ headless: !hasFlag('headed'), executablePath: await findChrome() });
  const results = [];
  try {
    for (const scenario of scenarios) {
      for (let run = 1; run <= runs; run++) {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        results.push(await measurePage(await context.newPage(), scenario, 'cold', run));
        await context.close();
      }
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      for (let run = 1; run <= runs; run++) results.push(await measurePage(page, scenario, 'warm', run));
      await context.close();
    }
  } finally {
    await browser.close();
  }
  const report = {
    generatedAt: new Date().toISOString(), target, network, device,
    browser: 'Chrome via Playwright', dataSaver: hasFlag('data-saver'),
    viewport: { width: 1440, height: 900 }, runsPerKind: runs, timeoutMs,
    completionDefinition: 'atlas:network-data-ready marks the first usable PMTiles route data for the current viewport; legacy route-count fallback is only for older deployments.',
    summary: summarize(results), results,
  };
  const outputPath = output || path.join(ROOT, 'reports', 'benchmarks', `atlas-${Date.now()}.json`);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote ${outputPath}`);
  for (const summary of report.summary) console.log(`${summary.scenario} ${summary.kind}: median=${summary.medianMs ?? 'n/a'}ms p75=${summary.p75Ms ?? 'n/a'}ms p95=${summary.p95Ms ?? 'n/a'}ms (${summary.completed}/${summary.runs} complete)`);
}

run().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
