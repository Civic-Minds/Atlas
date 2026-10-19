import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const data = JSON.parse(await readFile(new URL('../data/pricing.json', import.meta.url), 'utf8'));

test('has uniquely identified, sourced pricing plans', () => {
  const ids = data.records.map(record => record.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const record of data.records) {
    assert.ok(record.sourceUrl.startsWith('https://'));
    assert.match(record.currency, /^[A-Z]{3}$/);
    assert.ok(record.basePrice >= 0);
    assert.ok(record.vehicleTypes.length > 0);
  }
});

test('supports multiple plan types for one service', () => {
  const types = new Set(data.records.filter(record => record.service === 'Citi Bike NYC').map(record => record.planType));
  assert.deepEqual([...types].sort(), ['annual_membership', 'day_pass', 'single_ride']);
});
