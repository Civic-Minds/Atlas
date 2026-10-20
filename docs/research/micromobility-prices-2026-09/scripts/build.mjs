import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

const root = new URL('..', import.meta.url);
const source = JSON.parse(await readFile(new URL('data/pricing.json', root), 'utf8'));

const errors = [];
const allowedTypes = new Set(['single_ride', 'day_pass', 'monthly_membership', 'annual_membership', 'bundle', 'discount']);
const allowedCurrencies = /^[A-Z]{3}$/;
for (const record of source.records) {
  for (const field of ['id', 'city', 'country', 'operator', 'service', 'planName', 'currency', 'sourceUrl', 'checkedOn']) {
    if (!record[field]) errors.push(`${record.id ?? '<unknown>'}: missing ${field}`);
  }
  if (!allowedTypes.has(record.planType)) errors.push(`${record.id}: invalid planType`);
  if (!allowedCurrencies.test(record.currency)) errors.push(`${record.id}: invalid currency`);
  if (typeof record.basePrice !== 'number' || record.basePrice < 0) errors.push(`${record.id}: invalid basePrice`);
  if (!Array.isArray(record.vehicleTypes) || record.vehicleTypes.length === 0) errors.push(`${record.id}: vehicleTypes required`);
}
if (errors.length) throw new Error(errors.join('\n'));

await mkdir(new URL('public/data/', root), { recursive: true });
await writeFile(new URL('public/data/pricing.json', root), JSON.stringify(source, null, 2) + '\n');

const dbPath = decodeURIComponent(new URL('data/micromobility-prices.sqlite', root).pathname);
const db = new DatabaseSync(dbPath);
db.exec('DROP TABLE IF EXISTS pricing_plans; CREATE TABLE pricing_plans (id TEXT PRIMARY KEY, city TEXT NOT NULL, country TEXT NOT NULL, operator TEXT NOT NULL, service TEXT NOT NULL, vehicle_types TEXT NOT NULL, plan_type TEXT NOT NULL, plan_name TEXT NOT NULL, currency TEXT NOT NULL, base_price REAL NOT NULL, base_price_unit TEXT, validity_hours INTEGER, included_minutes INTEGER, included_vehicle_types TEXT, included_usage TEXT, pricing_tiers TEXT NOT NULL, fees TEXT NOT NULL, purchase_methods TEXT NOT NULL, effective_from TEXT, checked_on TEXT NOT NULL, source_type TEXT NOT NULL, source_url TEXT NOT NULL, source_note TEXT, status TEXT NOT NULL);');
const insert = db.prepare('INSERT INTO pricing_plans VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);');
for (const record of source.records) {
  const values = [record.id, record.city, record.country, record.operator, record.service, record.vehicleTypes.join(','), record.planType, record.planName, record.currency, record.basePrice, record.basePriceUnit ?? '', record.validityHours ?? '', record.includedMinutes ?? '', (record.includedVehicleTypes ?? []).join(','), record.includedUsage ?? '', JSON.stringify(record.pricingTiers ?? []), JSON.stringify(record.fees ?? []), (record.purchaseMethods ?? []).join(','), record.effectiveFrom ?? '', record.checkedOn, record.sourceType ?? 'official_web', record.sourceUrl, record.sourceNote ?? '', record.status];
  insert.run(...values);
}
db.close();
console.log(`Built ${source.records.length} pricing records and SQLite export.`);
