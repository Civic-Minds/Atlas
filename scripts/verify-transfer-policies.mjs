#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const TODAY = process.env.TRANSFER_VERIFICATION_DATE || new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
const INPUT = process.env.TRANSFER_VERIFICATION_INPUT || 'docs/research/transfer-inventory-2026-10-01/manual-verified-transfers.json';
const OUTPUT_DIR = path.join(ROOT, `docs/research/transfer-verification-${TODAY}`);
const concurrency = Number(process.env.TRANSFER_VERIFY_CONCURRENCY || 4);
const attempts = Number(process.env.TRANSFER_VERIFY_ATTEMPTS || 3);

const termPattern = /transfer|transfers|transfert|correspond|transbord|validity|valid|fare|fares|ticket|tickets|pass|passes|tarif|tarifs|heure|hour|minute|hora|voyage|cambio|换乘/gi;
const normalize = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const unique = (values) => [...new Set(values.filter(Boolean))];

function excerpts(text) {
  const normalized = normalize(text);
  termPattern.lastIndex = 0;
  const indexes = [...normalized.matchAll(termPattern)].map((match) => match.index ?? 0).slice(0, 8);
  return unique(indexes.map((index) => normalized.slice(Math.max(0, index - 220), Math.min(normalized.length, index + 700))));
}

function evidenceTokens(record) {
  return [record.transferPeriod, record.transferLimit, record.transferCost, record.paymentMethod]
    .flatMap((value) => String(value ?? '').split(/[^\p{L}\p{N}]+/u))
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length >= 4 && !['not', 'published', 'official', 'site', 'reviewed'].includes(value));
}

function compare(record, text, contentType) {
  if (!text || /pdf/i.test(contentType ?? '')) return 'manual-review-required';
  const lower = text.toLowerCase();
  const terms = evidenceTokens(record);
  const matched = terms.filter((term) => lower.includes(term));
  const hasTransferLanguage = /transfer|transfert|correspond|transbord|cambio|换乘/i.test(text);
  if (record.status === 'no_transfer_policy_published') {
    return hasTransferLanguage ? 'changed-or-new-policy-found' : 'supports-no-policy-found';
  }
  if (matched.length >= Math.max(2, Math.ceil(terms.length * 0.35)) && hasTransferLanguage) return 'supports-existing-policy';
  return 'manual-review-required';
}

async function gotoWithRetry(page, url) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  throw lastError;
}

const inventory = JSON.parse(await fs.readFile(path.join(ROOT, INPUT), 'utf8'));
const records = inventory.records;
await fs.mkdir(OUTPUT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const results = [];
let cursor = 0;

async function inspect(record) {
  const page = await browser.newPage({ userAgent: 'Atlas transfer-policy verification / official-source recheck' });
  page.setDefaultNavigationTimeout(25000);
  try {
    const response = await gotoWithRetry(page, record.sourceUrl);
    const contentType = response?.headers()?.['content-type'] ?? null;
    const title = await page.title().catch(() => null);
    const text = normalize(await page.locator('body').innerText().catch(() => ''));
    const currentExcerpts = excerpts(text);
    const comparison = compare(record, text, contentType);
    return {
      slug: record.slug,
      agencyName: record.agencyName,
      previousStatus: record.status,
      previousSourceUrl: record.sourceUrl,
      previousEvidence: record.evidence,
      previousTransferPeriod: record.transferPeriod,
      previousTransferLimit: record.transferLimit,
      previousTransferCost: record.transferCost,
      previousPaymentMethod: record.paymentMethod,
      checkedAt: TODAY,
      sourceUrl: record.sourceUrl,
      httpStatus: response?.status() ?? null,
      contentType,
      title,
      accessible: true,
      textAvailable: Boolean(text),
      currentEvidence: currentExcerpts,
      comparison,
      effectiveDate: null,
      manualConfirmationRequired: comparison === 'manual-review-required' || comparison === 'changed-or-new-policy-found' || !text,
    };
  } catch (error) {
    return {
      slug: record.slug,
      agencyName: record.agencyName,
      previousStatus: record.status,
      previousSourceUrl: record.sourceUrl,
      previousEvidence: record.evidence,
      checkedAt: TODAY,
      sourceUrl: record.sourceUrl,
      httpStatus: null,
      contentType: null,
      title: null,
      accessible: false,
      textAvailable: false,
      currentEvidence: [],
      comparison: 'source-inaccessible',
      effectiveDate: null,
      manualConfirmationRequired: true,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await page.close();
  }
}

async function worker() {
  while (cursor < records.length) {
    const record = records[cursor++];
    results.push(await inspect(record));
    if (results.length % 25 === 0) console.error(`Rechecked ${results.length}/${records.length} official sources`);
  }
}

await Promise.all(Array.from({ length: concurrency }, worker));
await browser.close();
results.sort((a, b) => a.slug.localeCompare(b.slug));

const counts = (field) => Object.fromEntries([...new Set(results.map((record) => record[field]))].map((value) => [value, results.filter((record) => record[field] === value).length]));
const payload = {
  scope: 'Atlas manually verified transfer-policy records',
  researchDate: TODAY,
  sourceInventory: INPUT,
  recordCount: results.length,
  stats: {
    accessible: results.filter((record) => record.accessible).length,
    inaccessible: results.filter((record) => !record.accessible).length,
    manualConfirmationRequired: results.filter((record) => record.manualConfirmationRequired).length,
    byComparison: counts('comparison'),
  },
  records: results,
};
await fs.writeFile(path.join(OUTPUT_DIR, 'transfer-verification.json'), `${JSON.stringify(payload, null, 2)}\n`);
const queue = results.filter((record) => record.manualConfirmationRequired);
await fs.writeFile(path.join(OUTPUT_DIR, 'transfer-verification-queue.json'), `${JSON.stringify({ researchDate: TODAY, recordCount: queue.length, records: queue }, null, 2)}\n`);
console.log(JSON.stringify({ outputDir: path.relative(ROOT, OUTPUT_DIR), ...payload.stats, recordCount: results.length }, null, 2));
