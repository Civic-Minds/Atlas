#!/usr/bin/env node

/**
 * Discover official fare/transfer pages for every Atlas agency.
 * Discovery is evidence collection only. It never promotes page text to a
 * confirmed policy; use manual-verified-transfers.json for that step.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const TODAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
const registry = JSON.parse(await fs.readFile(path.join(ROOT, 'public/data/index.json'), 'utf8')).agencies;
const outputDir = path.join(ROOT, `docs/research/transfer-inventory-${TODAY}`);
const offset = Math.max(0, Number(process.env.TRANSFER_SITE_OFFSET || 0));
const concurrency = Number(process.env.TRANSFER_SITE_CONCURRENCY || 4);
const limit = Math.min(offset + Number(process.env.TRANSFER_SITE_LIMIT || registry.length), registry.length);
const outputName = offset ? `official-site-review-${offset}-${limit}.json` : 'official-site-review.json';
const output = path.join(outputDir, outputName);
const termPattern = /transfer|transfers|fare|fares|ticket|tickets|pass|passes|tarif|tarifs|valid|validity|correspond|transbord|transbordo|transfert|cambio|integra|90.?min|120.?min|one.?hour|two.?hour|minute|heure|hora|分钟|换乘/gi;

function normalize(text) { return String(text ?? '').replace(/\s+/g, ' ').trim(); }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function hasTerms(text) { termPattern.lastIndex = 0; return termPattern.test(text); }
function termMatches(text) { termPattern.lastIndex = 0; return [...text.matchAll(termPattern)]; }

async function gotoWithRetry(page, url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  throw lastError;
}

async function inspectAgency(browser, agency) {
  const websiteUrl = agency.websiteUrl ?? agency.url;
  if (!websiteUrl) return { slug: agency.slug, agencyName: agency.name, status: 'no-official-website', sources: [], checkedAt: TODAY };
  const context = await browser.newContext({ userAgent: 'Atlas transfer-policy research / official-source discovery' });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(20000);
  try {
    await gotoWithRetry(page, websiteUrl);
    const homepage = await page.evaluate(() => ({
      title: document.title,
      text: document.body?.innerText || '',
      links: Array.from(document.querySelectorAll('a')).map((a) => ({ text: a.innerText.trim(), href: a.href })),
    }));
    const candidates = homepage.links
      .filter((link) => link.href.startsWith('http') && hasTerms(`${link.text} ${link.href}`))
      .filter((link, index, all) => all.findIndex((item) => item.href === link.href) === index)
      .slice(0, 8);
    const directUrls = [websiteUrl, agency.fareUrl].filter(Boolean);
    const pages = [...new Set(directUrls)].map((url) => ({ url, title: url === websiteUrl ? homepage.title : null, text: url === websiteUrl ? homepage.text : null }));
    pages.push(...candidates.filter((link) => !pages.some((page) => page.url === link.href)).map((link) => ({ url: link.href })));
    const sources = [];
    for (const candidate of pages) {
      if (candidate.url !== websiteUrl) {
        try {
          await gotoWithRetry(page, candidate.url);
          candidate.title = await page.title();
          candidate.text = await page.locator('body').innerText();
        } catch { continue; }
      }
      const text = normalize(candidate.text);
      if (!hasTerms(text)) continue;
      const matches = termMatches(text).map((match) => match.index ?? 0).slice(0, 6);
      const excerpts = unique(matches.map((index) => text.slice(Math.max(0, index - 240), Math.min(text.length, index + 760))));
      sources.push({
        url: candidate.url,
        title: candidate.title || null,
        evidenceExcerpts: excerpts,
        reviewStatus: 'needs-manual-verification',
      });
    }
    return {
      slug: agency.slug,
      agencyName: agency.name,
      websiteUrl,
      status: sources.length ? 'official-source-found' : 'official-transfer-page-not-found',
      sources,
      checkedAt: TODAY,
    };
  } catch (error) {
    return {
      slug: agency.slug,
      agencyName: agency.name,
      websiteUrl,
      status: 'official-site-inaccessible',
      sources: [],
      checkedAt: TODAY,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await context.close();
  }
}

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
let cursor = 0;
async function worker() {
  while (offset + cursor < limit) {
    const index = offset + cursor++;
    const result = await inspectAgency(browser, registry[index]);
    results.push(result);
    if (results.length % 25 === 0) console.error(`Reviewed ${results.length}/${limit} official sites`);
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));
await browser.close();
results.sort((a, b) => a.slug.localeCompare(b.slug));
const stats = Object.fromEntries(unique(results.map((result) => result.status)).map((status) => [status, results.filter((result) => result.status === status).length]));
await fs.writeFile(output, `${JSON.stringify({ scope: 'Atlas agency registry', researchDate: TODAY, limit, stats, records: results }, null, 2)}\n`);
console.log(JSON.stringify({ output: path.relative(ROOT, output), count: results.length, stats }, null, 2));
