import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { auditAgencyFeatures, AUDIT_KINDS } from './headway-filter-audit-core';

const fixture = JSON.parse(readFileSync(path.join(__dirname, '__fixtures__/headway-filter-routes.json'), 'utf8')) as {
  agencies: Record<string, any[]>;
};

describe('headway filter audit (fixture: real MiWay + TransLink routes)', () => {
  for (const [agency, features] of Object.entries(fixture.agencies)) {
    it(`${agency}: app decision equals map decision and no route passes with a slower direction`, () => {
      const result = auditAgencyFeatures(agency, features);
      expect(result.routes).toBeGreaterThan(0);
      expect(result.checks).toBeGreaterThan(0);
      for (const kind of AUDIT_KINDS) {
        expect({ kind, examples: result.mismatches.filter(m => m.kind === kind).slice(0, 5) })
          .toEqual({ kind, examples: [] });
      }
    });
  }
});
