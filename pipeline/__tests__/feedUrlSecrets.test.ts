import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Atlas is a public repo. Feed credentials belong in an env var named by
// `feedApiKeyEnvVar` (with `feedApiKeyParam` for the query parameter), never
// as a literal value inside a tracked URL.
const SECRET_PARAM = /[?&](api[_-]?key|apikey|key|token|access[_-]?token|secret|client[_-]?secret|subscription[_-]?key|password|auth)=([^&#\s"]+)/i;

const root = resolve(__dirname, '../..');
const agencyDir = resolve(root, 'config/agencies');

function collectStrings(value: unknown, path: string, out: Array<[string, string]>): void {
  if (typeof value === 'string') out.push([path, value]);
  else if (Array.isArray(value)) value.forEach((item, i) => collectStrings(item, `${path}[${i}]`, out));
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) collectStrings(item, path ? `${path}.${key}` : key, out);
  }
}

export function findEmbeddedSecrets(config: unknown): string[] {
  const strings: Array<[string, string]> = [];
  collectStrings(config, '', strings);
  return strings
    .filter(([, value]) => /^https?:\/\//i.test(value) && SECRET_PARAM.test(value))
    .map(([path, value]) => `${path} (${value.match(SECRET_PARAM)![1]}=…)`);
}

describe('feed URL secrets', () => {
  it('flags literal credentials in feed URLs', () => {
    expect(findEmbeddedSecrets({ feedUrl: 'https://x.test/gtfs?Key=abc123&OperatorCode=A' })).toHaveLength(1);
    expect(findEmbeddedSecrets({ feedFallbackUrls: ['https://x.test/f.zip?apikey=a&secret=b'] })).toHaveLength(1);
    expect(findEmbeddedSecrets({ feedUrl: 'https://x.test/gtfs?OperatorCode=A', feedApiKeyEnvVar: 'X_KEY' })).toEqual([]);
  });

  it('no agency config embeds an API key, token or secret in a URL', () => {
    const offenders: string[] = [];
    for (const name of readdirSync(agencyDir)) {
      if (!name.endsWith('.json') || name === 'order.json') continue;
      const config = JSON.parse(readFileSync(resolve(agencyDir, name), 'utf8'));
      for (const hit of findEmbeddedSecrets(config)) offenders.push(`${name}: ${hit}`);
    }
    expect(offenders).toEqual([]);
  });
});
