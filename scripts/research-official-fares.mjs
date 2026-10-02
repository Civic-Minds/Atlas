#!/usr/bin/env node

/**
 * Browser-assisted official fare-source review.
 * This discovers and captures official fare pages; it does not silently
 * promote page text into a verified fare. Records remain candidates until
 * manually reviewed against the captured page evidence.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const REGISTRY = JSON.parse(await fs.readFile(path.join(ROOT, 'public/data/index.json'), 'utf8')).agencies;
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const OUTPUT_DIR = path.join(ROOT, `docs/research/fare-inventory-${TODAY}`);
const OUTPUT = path.join(OUTPUT_DIR, 'official-site-review.json');
const CONCURRENCY = 4;
const LIMIT = Number(process.env.FARE_SITE_LIMIT || REGISTRY.length);

const FARE_TERMS = /fare|fares|tarif|tarifs|price|pricing|ticket|tickets|pass|passes|cost|料金|票价/i;
const AMOUNT_PATTERN = /(?:[$€£]|USD|CAD|EUR|GBP|MXN)\s*\d+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?\s*(?:[$€£]|USD|CAD|EUR|GBP|MXN)/gi;

function unique(values) { return [...new Set(values.filter(Boolean))]; }

function amounts(text) {
  return unique([...text.matchAll(AMOUNT_PATTERN)].map((match) => match[0].replace(/\s+/g, ' ').trim())).slice(0, 40);
}

function normalizeText(text) {
  return text.replace(/\s+/g, ' ').trim();
}

async function inspectAgency(browser, agency) {
  if (!agency.websiteUrl) return { slug: agency.slug, agencyName: agency.name, status: 'no-website', sources: [] };
  const context = await browser.newContext({ userAgent: 'Atlas fare research / official-source review' });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(20000);
  const sources = [];
  try {
    await page.goto(agency.websiteUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    const homepage = await page.evaluate(() => ({
      title: document.title,
      text: document.body?.innerText || '',
      links: Array.from(document.querySelectorAll('a')).map((a) => ({ text: a.innerText.trim(), href: a.href })),
    }));
    const candidates = homepage.links
      .filter((link) => link.href.startsWith('http') && FARE_TERMS.test(`${link.text} ${link.href}`))
      .filter((link, index, all) => all.findIndex((item) => item.href === link.href) === index)
      .slice(0, 6);
    const pages = [{ url: agency.websiteUrl, title: homepage.title, text: homepage.text }, ...candidates.map((link) => ({ url: link.href }))];
    for (const candidate of pages) {
      if (candidate.url !== agency.websiteUrl) {
        try {
          await page.goto(candidate.url, { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(350);
          candidate.title = await page.title();
          candidate.text = await page.locator('body').innerText();
        } catch { continue; }
      }
      const text = normalizeText(candidate.text || '');
      if (!FARE_TERMS.test(text) && !amounts(text).length) continue;
      const termIndex = text.search(FARE_TERMS);
      sources.push({
        url: candidate.url,
        title: candidate.title || null,
        amountCandidates: amounts(text),
        evidenceExcerpt: text.slice(Math.max(0, termIndex - 220), Math.min(text.length, termIndex + 900)),
        reviewStatus: 'needs-manual-verification',
      });
    }
    return {
      slug: agency.slug,
      agencyName: agency.name,
      websiteUrl: agency.websiteUrl,
      status: sources.length ? 'official-source-found' : 'official-fare-page-not-found',
      sources,
      checkedAt: TODAY,
    };
  } catch (error) {
    return {
      slug: agency.slug,
      agencyName: agency.name,
      websiteUrl: agency.websiteUrl,
      status: 'site-inaccessible',
      sources: [],
      checkedAt: TODAY,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await context.close();
  }
}

await fs.mkdir(OUTPUT_DIR, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
let cursor = 0;
async function worker() {
  while (cursor < Math.min(LIMIT, REGISTRY.length)) {
    const agency = REGISTRY[cursor++];
    results.push(await inspectAgency(browser, agency));
    if (results.length % 25 === 0) console.error(`Reviewed ${results.length}/${Math.min(LIMIT, REGISTRY.length)} official sites`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
await browser.close();
results.sort((a, b) => a.slug.localeCompare(b.slug));
const stats = Object.fromEntries(unique(results.map((result) => result.status)).map((status) => [status, results.filter((result) => result.status === status).length]));
await fs.writeFile(OUTPUT, `${JSON.stringify({ scope: 'Atlas agency registry', researchDate: TODAY, stats, records: results }, null, 2)}\n`);
console.log(JSON.stringify({ output: OUTPUT, count: results.length, stats }, null, 2));
