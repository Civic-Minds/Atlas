#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SCENARIOS = [
  { name: 'ottawa-city', lat: '45.42150', lon: '-75.69720', z: '10.00' },
  { name: 'ontario-region', lat: '44.37898', lon: '-76.84144', z: '6.00' },
  { name: 'broad', lat: '44.37898', lon: '-76.84144', z: '3.59' },
];

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

const target = arg('target', process.env.ATLAS_BENCHMARK_TARGET ?? 'http://localhost:5100');
const runs = Number(arg('runs', process.env.ATLAS_BENCHMARK_RUNS ?? 5));
const timeoutMs = Number(arg('timeout', process.env.ATLAS_BENCHMARK_TIMEOUT_MS ?? 60000));
const network = arg('network', process.env.ATLAS_BENCHMARK_NETWORK ?? 'unspecified');
const device = arg('device', process.env.ATLAS_BENCHMARK_DEVICE ?? 'desktop');
const output = arg('output', process.env.ATLAS_BENCHMARK_OUTPUT ?? '');
const scenarioName = arg('scenario', '');
const scenarios = scenarioName
  ? DEFAULT_SCENARIOS.filter(s => s.name === scenarioName)
  : DEFAULT_SCENARIOS;

if (!Number.isInteger(runs) || runs < 1) throw new Error('--runs must be a positive integer');
if (!scenarios.length) throw new Error('No matching scenarios');

function urlFor(scenario) {
  const params = new URLSearchParams({ h: '10', p: 'evening', lat: scenario.lat, lon: scenario.lon, z: scenario.z });
  if (hasFlag('data-saver')) params.set('dataSaver', '1');
  return `${target.replace(/\/$/, '')}/?${params}`;
}

function parseProgress(text) {
  const match = text.match(/(\d+)\/(\d+) networks/);
  return match ? { loaded: Number(match[1]), requested: Number(match[2]) } : null;
}

function parseFailures(text) {
  const match = text.match(/(\d+) networks? failed to load/);
  return match ? Number(match[1]) : 0;
}

function percentile(values, percentileRank) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((percentileRank / 100) * sorted.length) - 1);
  return sorted[index];
}

function summarize(results) {
  const grouped = results.reduce((groups, result) => {
    const key = `${result.scenario}:${result.kind}`;
    (groups[key] ??= []).push(result);
    return groups;
  }, {});
  return Object.values(grouped).map(group => ({
    scenario: group[0].scenario,
    kind: group[0].kind,
    runs: group.length,
    completed: group.filter(result => result.status === 'complete').length,
    timeouts: group.filter(result => result.status === 'timeout').length,
    medianMs: percentile(group.filter(result => result.status === 'complete').map(result => result.durationMs), 50),
    p75Ms: percentile(group.filter(result => result.status === 'complete').map(result => result.durationMs), 75),
    p95Ms: percentile(group.filter(result => result.status === 'complete').map(result => result.durationMs), 95),
  }));
}

async function findChrome() {
  const candidates = [
    process.env.ATLAS_BENCHMARK_CHROME,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {}
  }
  return undefined;
}

async function measurePage(page, scenario, kind, run) {
  const url = urlFor(scenario);
  const startedAt = new Date().toISOString();
  const wallStart = performance.now();
  let lastProgress = null;
  let lastFailures = 0;
  let markMs = null;
  let readyDetail = null;
  let timedOut = false;
  let completionSignal = null;
  let readySource = null;
  let sawLoadingBadge = false;
  let settledPolls = 0;

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const state = await page.evaluate(() => ({
      body: document.body.innerText,
      marks: performance.getEntriesByName('atlas:network-data-ready').map(entry => ({ startTime: entry.startTime, detail: entry.detail })),
      catalogReady: performance.getEntriesByName('atlas:agency-catalog-ready').length > 0,
    }));
    const progress = parseProgress(state.body);
    lastProgress = progress ?? lastProgress;
    lastFailures = parseFailures(state.body);
    if (progress) {
      sawLoadingBadge = true;
      settledPolls = 0;
    } else if (sawLoadingBadge && state.catalogReady) {
      settledPolls++;
    }
    if (state.marks.length && !progress) {
      const mark = state.marks.at(-1);
      markMs = mark.startTime;
      readyDetail = mark.detail;
      completionSignal = 'network-data-ready + loading badge absent';
      readySource = 'network-data-ready';
      break;
    }
    // Older deployed public builds do not have network-data-ready yet. Once
    // loading has visibly started, use a short quiet period as the fallback.
    const routeCountVisible = /\d+\s+routes/.test(state.body);
    if (!state.marks.length && settledPolls >= 4) {
      completionSignal = 'legacy catalog-ready + loading badge absent';
      readySource = 'legacy-loading-badge';
      break;
    }
    if (!state.marks.length && !sawLoadingBadge && !progress && routeCountVisible && Date.now() - new Date(startedAt).getTime() >= 8000) {
      completionSignal = 'legacy route-count visible + no loading badge';
      readySource = 'legacy-route-count';
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }

  if (markMs === null && !completionSignal) timedOut = true;
  return {
    scenario: scenario.name,
    kind,
    run,
    url,
    startedAt,
    durationMs: Math.round(markMs ?? (performance.now() - wallStart)),
    browserWallMs: Math.round(performance.now() - wallStart),
    mapReadyMarkMs: markMs === null ? null : Math.round(markMs),
    readyDetail,
    readySource,
    completionSignal,
    lastProgress,
    failedNetworks: lastFailures,
    status: timedOut ? 'timeout' : 'complete',
  };
}

async function run() {
  const executablePath = await findChrome();
  const browser = await chromium.launch({ headless: !hasFlag('headed'), executablePath });
  const results = [];

  try {
    for (const scenario of scenarios) {
      for (let runNumber = 1; runNumber <= runs; runNumber++) {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const page = await context.newPage();
        results.push(await measurePage(page, scenario, 'cold', runNumber));
        await context.close();
      }

      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      for (let runNumber = 1; runNumber <= runs; runNumber++) {
        results.push(await measurePage(page, scenario, 'warm', runNumber));
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }

  const report = {
    generatedAt: new Date().toISOString(),
    target,
    network,
    device,
    browser: 'Chrome via Playwright',
    dataSaver: hasFlag('data-saver'),
    viewport: { width: 1440, height: 900 },
    runsPerKind: runs,
    timeoutMs,
    summary: summarize(results),
    results,
  };
  const outputPath = output || path.join(ROOT, 'reports', 'benchmarks', `atlas-${Date.now()}.json`);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote ${outputPath}`);
  for (const summary of report.summary) {
    console.log(`${summary.scenario} ${summary.kind}: median=${summary.medianMs ?? 'n/a'}ms p75=${summary.p75Ms ?? 'n/a'}ms p95=${summary.p95Ms ?? 'n/a'}ms (${summary.completed}/${summary.runs} complete)`);
  }
  for (const result of results) {
    console.log(`${result.scenario} ${result.kind} #${result.run}: ${result.status} ${result.durationMs}ms${result.lastProgress ? ` (${result.lastProgress.loaded}/${result.lastProgress.requested})` : ''}${result.failedNetworks ? `, ${result.failedNetworks} failed` : ''}`);
  }
}

run().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
