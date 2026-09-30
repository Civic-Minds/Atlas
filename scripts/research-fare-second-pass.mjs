#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const date = process.env.FARE_OUTPUT_DATE || '2026-09-30';
const limit = Number(process.env.FARE_SECOND_PASS_LIMIT || 190);
const dir = path.join(process.cwd(), `docs/research/fare-inventory-${date}`);
const queue = JSON.parse(await fs.readFile(path.join(dir, 'fare-second-pass-queue.json'), 'utf8'));
const targets = queue.records.filter((record) => record.priority === 1).slice(0, limit);
const outputPath = path.join(dir, 'fare-second-pass-site-review.json');
const fareTerms = /fare|fares|tarif|tarifs|price|pricing|ticket|tickets|pass|passes|cost|料金|票价/i;
const amountPattern = /(?:[$€£]|USD|CAD|EUR|GBP|MXN)\s*\d+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?\s*(?:[$€£]|USD|CAD|EUR|GBP|MXN)/gi;
const normalize = (text) => text.replace(/\s+/g, ' ').trim();
const amounts = (text) => [...new Set([...text.matchAll(amountPattern)].map((match) => match[0].replace(/\s+/g, ' ').trim()))].slice(0, 40);

async function inspect(browser, record) {
  if (!record.officialWebsite) return { ...record, reviewStatus: 'no-official-website', sources: [] };
  const context = await browser.newContext({ userAgent: 'Atlas fare research / second-pass review' });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(20000);
  const sources = [];
  try {
    await page.goto(record.officialWebsite, { waitUntil: 'domcontentloaded' });
    const homepage = await page.evaluate(() => ({
      title: document.title,
      text: document.body?.innerText || '',
      links: Array.from(document.querySelectorAll('a')).map((a) => ({ text: a.innerText.trim(), href: a.href })),
    }));
    const links = homepage.links
      .filter((link) => link.href.startsWith('http') && fareTerms.test(`${link.text} ${link.href}`))
      .filter((link, index, all) => all.findIndex((item) => item.href === link.href) === index)
      .slice(0, 8);
    const pages = [{ url: record.officialWebsite, title: homepage.title, text: homepage.text }, ...links.map((link) => ({ url: link.href }))];
    for (const candidate of pages) {
      if (candidate.url !== record.officialWebsite) {
        try {
          await page.goto(candidate.url, { waitUntil: 'domcontentloaded' });
          candidate.title = await page.title();
          candidate.text = await page.locator('body').innerText();
        } catch { continue; }
      }
      const text = normalize(candidate.text || '');
      if (!fareTerms.test(text) && !amounts(text).length) continue;
      const termIndex = text.search(fareTerms);
      sources.push({ url: candidate.url, title: candidate.title || null, amountCandidates: amounts(text), evidenceExcerpt: text.slice(Math.max(0, termIndex - 240), Math.min(text.length, termIndex + 1400)), reviewStatus: 'needs-manual-verification' });
    }
    return { ...record, reviewStatus: sources.length ? 'official-source-found' : 'official-fare-page-not-found', sources, checkedAt: date };
  } catch (error) {
    return { ...record, reviewStatus: 'site-inaccessible', sources: [], checkedAt: date, error: error instanceof Error ? error.message : String(error) };
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch({ headless: true });
const results = [];
let cursor = 0;
const worker = async () => {
  while (cursor < targets.length) {
    const record = targets[cursor++];
    results.push(await inspect(browser, record));
    if (results.length % 25 === 0) console.error(`Reviewed ${results.length}/${targets.length} priority-one sites`);
  }
};
await Promise.all(Array.from({ length: 4 }, worker));
await browser.close();
results.sort((a, b) => a.slug.localeCompare(b.slug));
const stats = Object.fromEntries([...new Set(results.map((record) => record.reviewStatus))].map((status) => [status, results.filter((record) => record.reviewStatus === status).length]));
await fs.writeFile(outputPath, `${JSON.stringify({ scope: 'Targeted second-pass official-site review', researchDate: date, sourceQueue: 'fare-second-pass-queue.json', stats, records: results }, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, count: results.length, stats }, null, 2));
