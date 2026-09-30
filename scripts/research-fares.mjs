#!/usr/bin/env node

/**
 * Build a source-backed fare research inventory for every Atlas registry agency.
 *
 * This script is intentionally read-only with respect to Atlas product data.
 * Downloaded feeds are cached under tmp/, which is gitignored.
 *
 * Usage:
 *   node scripts/research-fares.mjs
 *   node scripts/research-fares.mjs --fetch
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import Papa from 'papaparse';

const ROOT = process.cwd();
const TODAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Toronto',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());
const FETCH_MISSING = process.argv.includes('--fetch');
const REGISTRY_PATH = path.join(ROOT, 'public/data/index.json');
const CACHE_DIR = path.join(ROOT, 'tmp/fare-research');
const OUTPUT_DIR = path.join(ROOT, `docs/research/fare-inventory-${TODAY}`);
const JSON_OUT = path.join(OUTPUT_DIR, 'fare-inventory.json');
const CSV_OUT = path.join(OUTPUT_DIR, 'fare-inventory.csv');
const MD_OUT = path.join(OUTPUT_DIR, 'fare-inventory.md');

const currencySymbols = { USD: '$', CAD: '$', EUR: '€', GBP: '£', MXN: '$' };

function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-');
}

function parseCsv(text) {
  const result = Papa.parse(text.trim(), { header: true, skipEmptyLines: true });
  return result.data ?? [];
}

function parseMoney(value) {
  const number = Number.parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

async function readZip(filePath) {
  const zip = await JSZip.loadAsync(await fs.readFile(filePath));
  const files = {};
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const basename = path.basename(name).toLowerCase();
    if (!/^fare_(attributes|rules|products|rider_categories)\.txt$|^feed_info\.txt$/.test(basename)) continue;
    const key = basename.replace(/\.txt$/, '');
    if (!files[key]) files[key] = parseCsv(await entry.async('text'));
  }
  return files;
}

async function findLocalZips() {
  const files = [];
  async function walk(directory) {
    let entries = [];
    try { entries = await fs.readdir(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.toLowerCase().endsWith('.zip')) files.push(full);
    }
  }
  await walk(path.join(ROOT, 'tmp'));
  return files;
}

function chooseZip(agency, zipPaths) {
  const wanted = [agency.slug, agency.name, ...(agency.searchAliases ?? [])].map(normalize);
  const scored = zipPaths.map((filePath) => {
    const filename = normalize(path.basename(filePath, '.zip'));
    let score = 0;
    for (const candidate of wanted) {
      if (!candidate) continue;
      if (filename === candidate) score = Math.max(score, 100);
      else if (filename.includes(candidate) || candidate.includes(filename)) score = Math.max(score, 60);
    }
    return { filePath, score };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
  return scored[0]?.filePath ?? null;
}

async function downloadFeed(agency) {
  if (!agency.feedUrl) return null;
  const destination = path.join(CACHE_DIR, `${agency.slug}.zip`);
  try {
    await fs.access(destination);
    return destination;
  } catch { /* download below */ }

  try {
    const response = await fetch(agency.feedUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(30000),
      headers: { 'User-Agent': 'Atlas fare research audit/1.0' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 150 * 1024 * 1024) throw new Error('feed exceeds 150 MB safety limit');
    await fs.writeFile(destination, bytes);
    return destination;
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function downloadMissingFeeds(agencies, zipPaths) {
  const missing = agencies.filter((agency) => !chooseZip(agency, zipPaths));
  const downloaded = new Map();
  let cursor = 0;
  let completed = 0;
  async function worker() {
    while (cursor < missing.length) {
      const agency = missing[cursor++];
      const result = await downloadFeed(agency);
      if (typeof result === 'string') {
        downloaded.set(agency.slug, result);
        zipPaths.push(result);
      } else if (result?.error) {
        downloaded.set(agency.slug, { error: result.error });
      }
      completed += 1;
      if (completed % 25 === 0) console.error(`Fetched ${completed}/${missing.length} feeds`);
    }
  }
  await Promise.all(Array.from({ length: 12 }, () => worker()));
  return downloaded;
}

async function loadPublishedOverrides() {
  const urls = ['https://data.transitatlas.fyi/atlas/fare-overrides.json'];
  for (const url of urls) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (response.ok) return await response.json();
    } catch { /* continue */ }
  }
  return {};
}

function extractFare(agency, files, sourceUrl) {
  const products = files.fare_products ?? [];
  const attributes = files.fare_attributes ?? [];
  const riderCategories = new Map((files.rider_categories ?? []).map((row) => [row.rider_category_id, row.rider_category_name || '']));
  const feedInfo = files.feed_info?.[0] ?? {};
  const excluded = /(child|youth|senior|elder|disabled|student|reduced|concession|parking|monthly|weekly|day pass|24.?hour|48.?hour|72.?hour|10 voyages|10 rides|multi.?ride)/i;
  const adult = (row) => !excluded.test(`${row.productName || row.label || ''} ${riderCategories.get(row.riderCategoryId || row.category) || ''}`);
  const currencies = unique([...products, ...attributes].map((row) => row.currency_type || row.currency));
  const productRows = products.map((row) => ({
    amount: parseMoney(row.amount),
    currency: row.currency_type || row.currency,
    label: row.fare_product_name || row.fare_product_id,
    productName: row.fare_product_name || '',
    riderCategoryId: row.rider_category_id || null,
  })).filter((row) => row.amount != null && adult(row));
  const attributeRows = attributes.map((row) => ({
    amount: parseMoney(row.price),
    currency: row.currency_type,
    label: row.fare_id,
  })).filter((row) => row.amount != null);
  const rows = productRows.length ? productRows : attributeRows;
  if (!rows.length) return null;

  const positive = rows.filter((row) => row.amount > 0);
  if (!positive.length && !productRows.length) {
    return {
      amount: null,
      currency: currencies[0] || null,
      fareType: 'GTFS zero-fare candidate',
      label: null,
      sourceUrl,
      sourceType: 'gtfs',
      confidence: 'unresolved',
      status: 'unresolved',
      notes: 'GTFS publishes only zero-value legacy fare attributes; this may be a placeholder and was not treated as proof of free service.',
      effectiveDate: feedInfo.feed_end_date || null,
      feedVersion: feedInfo.feed_version || null,
    };
  }
  const selected = (positive.length ? positive : rows).sort((a, b) => a.amount - b.amount)[0];
  const hasMultiple = new Set(rows.map((row) => `${row.amount}:${row.currency}`)).size > 1 || (products.length > 0 && productRows.length < products.length);
  return {
    amount: selected.amount,
    currency: selected.currency || null,
    fareType: products.length ? 'GTFS Fares V2 base product' : 'GTFS Fares V1 fare attribute',
    label: selected.label,
    sourceUrl,
    sourceType: 'gtfs',
    confidence: products.length ? 'medium' : 'low',
    status: hasMultiple ? 'partially confirmed' : 'confirmed',
    notes: hasMultiple
      ? `Feed publishes multiple products; discounted, special, or non-core products were excluded where identifiable, then the lowest positive core candidate was retained.`
      : 'Fare extracted from the current locally available GTFS feed.',
    currencies,
    effectiveDate: feedInfo.feed_end_date || null,
    feedVersion: feedInfo.feed_version || null,
  };
}

function emptyRecord(agency, status, sourceUrl, notes) {
  return {
    slug: agency.slug,
    agencyName: agency.name,
    region: agency.region ?? null,
    amount: null,
    currency: null,
    fareType: null,
    label: null,
    sourceUrl: sourceUrl ?? agency.websiteUrl ?? null,
    sourceType: sourceUrl ? 'agency-feed' : 'agency-website',
    effectiveDate: null,
    researchDate: TODAY,
    confidence: 'unresolved',
    status,
    notes,
  };
}

function csvEscape(value) {
  const text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function makeMarkdown(records, stats) {
  const confirmed = records.filter((row) => row.amount != null);
  const byStatus = Object.entries(stats.statuses).sort((a, b) => b[1] - a[1]);
  const examples = confirmed.slice().sort((a, b) => (a.amount ?? 0) - (b.amount ?? 0)).slice(0, 12);
  return `# Atlas Fare Inventory (${TODAY})

Research snapshot for the ${records.length} agencies in Atlas's current registry. This is a best-effort core-fare inventory, not a complete concession or fare-product catalog.

## Coverage

- Confirmed or candidate fare records: ${confirmed.length}
- Agencies without a usable fare record: ${records.length - confirmed.length}
- Sources: current Atlas fare overrides and GTFS feeds available locally or fetched during this run
- Research date: ${TODAY}

Status counts: ${byStatus.map(([status, count]) => `${status} (${count})`).join(', ')}.

## Lowest fare candidates found

| Agency | Fare | Type | Confidence | Source |
| --- | ---: | --- | --- | --- |
${examples.map((row) => `| ${row.agencyName} | ${currencySymbols[row.currency] ?? ''}${row.amount?.toFixed(2) ?? ''} ${row.currency ?? ''} | ${row.fareType ?? ''} | ${row.confidence} | [source](${row.sourceUrl}) |`).join('\n')}

## Interpretation

GTFS fare files often publish several products without enough metadata to identify the ordinary adult fare. Those records are retained as candidates and marked partial or low-confidence. Missing fare data does not mean the agency is free; it means no usable fare was verified in the sources inspected.

The full per-agency evidence ledger is in the companion JSON and CSV files.
`;
}

async function main() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const registry = JSON.parse(await fs.readFile(REGISTRY_PATH, 'utf8')).agencies;
  const overrides = await loadPublishedOverrides();
  let zipPaths = await findLocalZips();
  const parsedZipCache = new Map();
  const fetchedFeeds = FETCH_MISSING ? await downloadMissingFeeds(registry, zipPaths) : new Map();
  const records = [];

  for (let index = 0; index < registry.length; index += 1) {
    const agency = registry[index];
    const override = overrides[agency.slug];
    if (override?.adult != null || override?.free) {
      records.push({
        ...emptyRecord(agency, 'confirmed', override.source ?? override.fareUrl, 'Published Atlas fare override backed by an agency fare source.'),
        amount: override.free ? 0 : override.adult,
        currency: override.currency ?? null,
        fareType: override.free ? 'free service' : 'published Atlas base adult fare',
        label: override.label ?? null,
        sourceUrl: override.source ?? override.fareUrl ?? agency.websiteUrl ?? null,
        sourceType: 'official-fare-source',
        confidence: 'high',
        notes: override.adultCash != null ? `Card/base fare; published cash fare is ${override.adultCash} ${override.currency ?? ''}.` : 'Existing Atlas override retained as research evidence.',
        effectiveDate: null,
      });
      continue;
    }

    let zipPath = chooseZip(agency, zipPaths) ?? fetchedFeeds.get(agency.slug);
    if (zipPath && typeof zipPath !== 'string') {
      records.push(emptyRecord(agency, 'inaccessible', agency.feedUrl, `Feed download failed: ${zipPath.error}`));
      continue;
    }

    if (!zipPath) {
      records.push(emptyRecord(agency, 'no fare found', agency.feedUrl ?? agency.websiteUrl, 'No locally available feed with a fare file was found; official web fare review remains unresolved.'));
      continue;
    }

    try {
      let files = parsedZipCache.get(zipPath);
      if (!files) {
        files = await readZip(zipPath);
        parsedZipCache.set(zipPath, files);
      }
      const extracted = extractFare(agency, files, agency.feedUrl ?? agency.websiteUrl);
      records.push(extracted ? { ...emptyRecord(agency, extracted.status, extracted.sourceUrl, extracted.notes), ...extracted, researchDate: TODAY } : emptyRecord(agency, 'no fare found', agency.feedUrl, 'Feed was inspected but did not contain a usable fare_attributes.txt or fare_products.txt record.'));
    } catch (error) {
      records.push(emptyRecord(agency, 'inaccessible', agency.feedUrl, `Cached feed could not be read: ${error instanceof Error ? error.message : String(error)}`));
    }
    if ((index + 1) % 25 === 0) console.error(`Audited ${index + 1}/${registry.length}`);
  }

  const statuses = Object.fromEntries(unique(records.map((row) => row.status)).map((status) => [status, records.filter((row) => row.status === status).length]));
  const stats = { registryCount: registry.length, recordCount: records.length, statuses, generatedAt: new Date().toISOString(), fetchMissing: FETCH_MISSING };
  await fs.writeFile(JSON_OUT, `${JSON.stringify({ scope: 'Atlas agency registry', stats, records }, null, 2)}\n`);
  const columns = ['slug', 'agencyName', 'region', 'amount', 'currency', 'fareType', 'label', 'sourceUrl', 'sourceType', 'effectiveDate', 'researchDate', 'confidence', 'status', 'notes'];
  await fs.writeFile(CSV_OUT, `${columns.join(',')}\n${records.map((row) => columns.map((column) => csvEscape(row[column])).join(',')).join('\n')}\n`);
  await fs.writeFile(MD_OUT, makeMarkdown(records, stats));
  console.log(JSON.stringify({ ...stats, outputs: [JSON_OUT, CSV_OUT, MD_OUT] }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
