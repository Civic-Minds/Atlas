#!/usr/bin/env npx tsx
/** Compare strict baseline output with the additive edge-transition experiment output. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const baselineDir = resolve(process.argv.find(arg => arg.startsWith('--baseline='))?.slice(11) ?? 'tmp/edge-transition-baseline');
const candidateDir = resolve(process.argv.find(arg => arg.startsWith('--candidate='))?.slice(12) ?? 'tmp/edge-transition-candidate');
const outPath = process.argv.find(arg => arg.startsWith('--out='))?.slice(6);
const experimentalKey = 'headwayByPeriodSustainedEdgeTransition';

type Feature = { properties?: Record<string, unknown> };
type Collection = { features?: Feature[] };

function load(path: string): Collection {
  return JSON.parse(readFileSync(path, 'utf8')) as Collection;
}

function stable(value: unknown): string {
  return JSON.stringify(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

const files = JSON.parse(readFileSync(resolve(candidateDir, 'manifest.json'), 'utf8')) as { agencies?: Array<{ slug: string; status: string }> };
const agencies = (files.agencies ?? []).filter(entry => entry.status === 'ok').map(entry => entry.slug).sort();
const report = {
  baselineDir,
  candidateDir,
  experimentalKey,
  agencies,
  totals: {
    agencies: agencies.length,
    features: 0,
    comparedProperties: 0,
    changed: 0,
    newlyNull: 0,
    newlyPresent: 0,
    materiallyDifferent: 0,
    experimentalPeriods: 0,
    experimentalTransitions: 0,
    experimentalNewlyTrue: 0,
    experimentalNewlyFalse: 0,
  },
  byAgency: [] as Array<Record<string, unknown>>,
};

for (const slug of agencies) {
  const baseline = load(resolve(baselineDir, `${slug}.json`));
  const candidate = load(resolve(candidateDir, `${slug}.json`));
  const baseFeatures = baseline.features ?? [];
  const candidateFeatures = candidate.features ?? [];
  const result = {
    slug,
    baselineFeatures: baseFeatures.length,
    candidateFeatures: candidateFeatures.length,
    comparedFeatures: Math.min(baseFeatures.length, candidateFeatures.length),
    changed: 0,
    newlyNull: 0,
    newlyPresent: 0,
    materiallyDifferent: 0,
    experimentalPeriods: 0,
    experimentalTransitions: 0,
    experimentalNewlyTrue: 0,
    experimentalNewlyFalse: 0,
  };
  if (baseFeatures.length !== candidateFeatures.length) result.changed += Math.abs(baseFeatures.length - candidateFeatures.length);
  for (let i = 0; i < Math.min(baseFeatures.length, candidateFeatures.length); i += 1) {
    const before = baseFeatures[i].properties ?? {};
    const after = candidateFeatures[i].properties ?? {};
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    keys.delete(experimentalKey);
    for (const key of keys) {
      report.totals.comparedProperties += 1;
      const oldValue = before[key];
      const newValue = after[key];
      if (stable(oldValue) === stable(newValue)) continue;
      result.changed += 1;
      if (oldValue != null && newValue == null) result.newlyNull += 1;
      if (oldValue == null && newValue != null) result.newlyPresent += 1;
      if (isNumber(oldValue) && isNumber(newValue) && oldValue !== newValue) result.materiallyDifferent += 1;
    }
    const strict = (after.headwayByPeriodSustained ?? {}) as Record<string, unknown>;
    const experimental = (after[experimentalKey] ?? {}) as Record<string, unknown>;
    for (const period of new Set([...Object.keys(strict), ...Object.keys(experimental)])) {
      result.experimentalPeriods += 1;
      if (strict[period] === experimental[period]) continue;
      result.experimentalTransitions += 1;
      if (strict[period] === false && experimental[period] === true) result.experimentalNewlyTrue += 1;
      if (strict[period] === true && experimental[period] === false) result.experimentalNewlyFalse += 1;
    }
  }
  report.totals.features += result.comparedFeatures;
  report.totals.changed += result.changed;
  report.totals.newlyNull += result.newlyNull;
  report.totals.newlyPresent += result.newlyPresent;
  report.totals.materiallyDifferent += result.materiallyDifferent;
  report.totals.experimentalPeriods += result.experimentalPeriods;
  report.totals.experimentalTransitions += result.experimentalTransitions;
  report.totals.experimentalNewlyTrue += result.experimentalNewlyTrue;
  report.totals.experimentalNewlyFalse += result.experimentalNewlyFalse;
  report.byAgency.push(result);
}

const output = `${JSON.stringify(report, null, 2)}\n`;
if (outPath) writeFileSync(resolve(outPath), output);
console.log(output);
