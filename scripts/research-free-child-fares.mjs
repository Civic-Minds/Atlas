#!/usr/bin/env node

/**
 * Capture official-site candidates for manual research of child-free fares.
 *
 * This script is discovery only. It never promotes page text into a verified
 * policy. Every record must be manually reviewed before it is used in the
 * final child-fare ledger.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const REGISTRY = JSON.parse(await fs.readFile(path.join(ROOT, 'public/data/index.json'), 'utf8')).agencies;
const TODAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Toronto',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());
const OUTPUT_DIR = path.join(ROOT, `docs/research/free-child-fares-${TODAY}`);
const OUTPUT = path.join(OUTPUT_DIR, 'official-site-candidates.json');
const PARTIAL_OUTPUT = path.join(OUTPUT_DIR, 'official-site-candidates.partial.json');
const CONCURRENCY = Number(process.env.CHILD_FARE_CONCURRENCY || 4);
const LIMIT = Number(process.env.CHILD_FARE_LIMIT || REGISTRY.length);

const DISCOVERY_TERMS = /fare|fares|tarif|tarifs|price|pricing|ticket|tickets|pass|passes|cost|children|child|kids|youth|student|under.?12|under.?13|under.?18|free|gratis|gratuit|enfant|jeune|kind|kinder|niño|niños|料金|儿童|小児|무료/i;
const POLICY_TERMS = /child|children|kid|kids|youth|student|under.?\d+|age|free|gratis|gratuit|enfant|jeune|kind|kinder|niño|niños|料金|儿童|小児|무료/i;

function normalizeText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function uniqueLinks(links) {
  return [...new Map(links.filter((link) => link.href?.startsWith('http'))
    .map((link) => [link.href, link])).values()];
}

function excerpt(text) {
  const normalized = normalizeText(text);
  const matches = [...normalized.matchAll(new RegExp(POLICY_TERMS.source, 'gi'))].slice(0, 8);
  if (!matches.length) return normalized.slice(0, 900);
  return matches.map((match) => normalized.slice(Math.max(0, match.index - 180), Math.min(normalized.length, match.index + 420))).join(' … ');
}

async function inspectAgency(browser, agency) {
  const base = {
    slug: agency.slug,
    agencyName: agency.name,
    region: agency.region ?? null,
    websiteUrl: agency.websiteUrl ?? null,
    checkedAt: TODAY,
  };
  if (!agency.websiteUrl) return { ...base, status: 'no-official-website', sources: [] };

  const context = await browser.newContext({ userAgent: 'Atlas child-fare research / official-source discovery' });
  const page = await context.newPage();
  page.on('dialog', async (dialog) => {
    try { await dialog.dismiss(); } catch { /* page may have closed */ }
  });
  page.setDefaultTimeout(5000);
  page.setDefaultNavigationTimeout(5000);
  const sources = [];
  const visited = new Set();
  try {
    await page.goto(agency.websiteUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(150);
    const homepage = await page.evaluate(() => ({
      title: document.title,
      text: document.body?.innerText || '',
      links: Array.from(document.querySelectorAll('a')).map((a) => ({ text: a.innerText.trim(), href: a.href })),
    }));
    const candidates = [{ url: agency.websiteUrl, text: homepage.text, title: homepage.title }, ...uniqueLinks(homepage.links)
      .filter((link) => DISCOVERY_TERMS.test(`${link.text} ${link.href}`))
      .slice(0, 3)
      .map((link) => ({ url: link.href }))];

    for (const candidate of candidates) {
      if (visited.has(candidate.url)) continue;
      visited.add(candidate.url);
      try {
        if (!candidate.text) {
          await page.goto(candidate.url, { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(100);
          candidate.title = await page.title();
          candidate.text = await page.locator('body').innerText();
        }
        const text = normalizeText(candidate.text);
        if (!DISCOVERY_TERMS.test(`${candidate.title || ''} ${candidate.url} ${text}`)) continue;
        sources.push({
          url: candidate.url,
          title: candidate.title || null,
          evidenceExcerpt: excerpt(text),
          reviewStatus: 'needs-manual-verification',
        });
      } catch (error) {
        sources.push({
          url: candidate.url,
          title: candidate.title || null,
          reviewStatus: 'candidate-fetch-failed',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return { ...base, status: sources.length ? 'official-source-candidates-found' : 'official-child-fare-page-not-found', sources };
  } catch (error) {
    return {
      ...base,
      status: 'official-site-inaccessible',
      sources: [],
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await context.close();
  }
}

await fs.mkdir(OUTPUT_DIR, { recursive: true });
const browser = await chromium.launch({ headless: true });
const previous = await fs.access(PARTIAL_OUTPUT)
  .then(async () => JSON.parse(await fs.readFile(PARTIAL_OUTPUT, 'utf8')))
  .catch(() => ({ records: [] }));
const results = previous.records ?? [];
const completed = new Set(results
  .filter((result) => !result.sources?.some((source) => source.reviewStatus === 'candidate-fetch-failed'))
  .map((result) => result.slug));
let cursor = 0;
const target = Math.min(LIMIT, REGISTRY.length);
async function worker() {
  while (cursor < target) {
    const agency = REGISTRY[cursor++];
    if (completed.has(agency.slug)) continue;
    results.push(await inspectAgency(browser, agency));
    if (results.length % 25 === 0) {
      await fs.writeFile(PARTIAL_OUTPUT, `${JSON.stringify({ records: results }, null, 2)}\n`);
      console.error(`Reviewed ${results.length}/${target} official sites`);
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
await browser.close();
const uniqueResults = [...new Map(results.map((result) => [result.slug, result])).values()]
  .sort((a, b) => a.slug.localeCompare(b.slug));
const stats = Object.fromEntries([...new Set(uniqueResults.map((result) => result.status))]
  .map((status) => [status, uniqueResults.filter((result) => result.status === status).length]));
await fs.writeFile(OUTPUT, `${JSON.stringify({
  scope: 'Atlas agency registry',
  registryCount: REGISTRY.length,
  researchedCount: uniqueResults.length,
  researchDate: TODAY,
  discoveryOnly: true,
  stats,
  records: uniqueResults,
}, null, 2)}\n`);
await fs.rm(PARTIAL_OUTPUT, { force: true });
console.log(JSON.stringify({ output: OUTPUT, count: results.length, stats }, null, 2));
