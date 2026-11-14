/**
 * CIV-1430: the one approved exception to "History v2 sidecars are never overwritten".
 *
 * A published sidecar may be replaced only when the new body is the old body plus weekend fields the old one
 * did not have: Saturday/Sunday `p` (per-period values, CIV-1425) and `t` / `tp` (shared-stretch values,
 * CIV-1431). Removing those additions from the new body must give the old body back byte for byte, so every
 * weekday field, every weekend headline, every route and every top-level field (refDate, refDateQuality, ...)
 * is unchanged. Anything else is refused and reported field by field.
 *
 * Approvals are listed here by ticket, each for exactly one agency; nothing else can use the exception.
 * Pure: no R2 access.
 */
import { createHash } from 'node:crypto';

/** Ticket -> the one agency slug it approves (Ryan's decision on CIV-1430, 2026-11-13: "1", MBTA). */
export const APPROVED_REPLACEMENTS: Readonly<Record<string, string>> = { 'CIV-1430': 'mbta' };

/** Weekend fields a replacement may add. */
export const ADDABLE_WEEKEND_FIELDS = ['p', 't', 'tp'] as const;
const WEEKEND_DAYS = ['sat', 'sun'] as const;

export function approvedSlugFor(ticket: string): string | null {
  return Object.prototype.hasOwnProperty.call(APPROVED_REPLACEMENTS, ticket) ? APPROVED_REPLACEMENTS[ticket] : null;
}

/** Throws unless `ticket` approves replacements for exactly `slug`. */
export function assertReplacementApproved(ticket: string, slug: string): void {
  const approved = approvedSlugFor(ticket);
  if (!approved) throw new Error(`--replace-approved ${ticket}: no such approval (known: ${Object.keys(APPROVED_REPLACEMENTS).join(', ')})`);
  if (approved !== slug) throw new Error(`--replace-approved ${ticket} covers only ${approved}, not ${slug}`);
}

/** One added field: route key, day and field name. */
export interface AddedField { route: string; day: 'sat' | 'sun'; field: (typeof ADDABLE_WEEKEND_FIELDS)[number] }

/** One differing field (dotted path, e.g. routes.1.rep.h or refDate), with both values as JSON (undefined = absent). */
export interface FieldChange { path: string; before?: string; after?: string }

export interface ReplacementCheck {
  /** True when the only differences are added weekend p / t / tp. */
  ok: boolean;
  /** Weekend fields the new body adds (empty when identical). */
  added: AddedField[];
  /** Every other differing field (empty when ok). */
  changes: FieldChange[];
  /** Why it was refused, one line (absent when ok). */
  reason?: string;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Every leaf (or type-changing node) that differs between two JSON values, as dotted paths. */
export function diffJson(a: unknown, b: unknown, path = ''): FieldChange[] {
  if (isObj(a) && isObj(b)) {
    const out: FieldChange[] = [];
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) out.push(...diffJson(a[k], b[k], path ? `${path}.${k}` : k));
    return out;
  }
  const ja = a === undefined ? undefined : JSON.stringify(a);
  const jb = b === undefined ? undefined : JSON.stringify(b);
  return ja === jb ? [] : [{ path: path || '(root)', ...(ja !== undefined ? { before: ja } : {}), ...(jb !== undefined ? { after: jb } : {}) }];
}

/**
 * Check a replacement: strip from the new body the weekend fields the old body lacks, and require the result to be
 * the old body byte for byte. Works on the raw bodies so key order and number formatting count too.
 */
export function checkWeekendOnlyAddition(oldBody: string, newBody: string): ReplacementCheck {
  let oldJson: unknown;
  let newJson: unknown;
  try { oldJson = JSON.parse(oldBody); newJson = JSON.parse(newBody); } catch {
    return { ok: false, added: [], changes: [], reason: 'not valid JSON' };
  }
  if (!isObj(oldJson) || !isObj(newJson) || !isObj(oldJson.routes) || !isObj(newJson.routes)) {
    return { ok: false, added: [], changes: diffJson(oldJson, newJson), reason: 'not a sidecar (no routes object)' };
  }
  const stripped = JSON.parse(newBody) as Obj;
  const strippedRoutes = stripped.routes as Obj;
  const oldRoutes = oldJson.routes as Obj;
  const added: AddedField[] = [];
  for (const [route, rec] of Object.entries(strippedRoutes)) {
    const before = oldRoutes[route];
    if (!isObj(rec) || !isObj(before)) continue;
    for (const day of WEEKEND_DAYS) {
      const nd = rec[day];
      const od = before[day];
      if (!isObj(nd) || !isObj(od)) continue;
      for (const field of ADDABLE_WEEKEND_FIELDS) {
        if (nd[field] !== undefined && od[field] === undefined) { delete nd[field]; added.push({ route, day, field }); }
      }
    }
  }
  if (JSON.stringify(stripped) === oldBody) return { ok: true, added, changes: [] };
  const changes = diffJson(oldJson, newJson).filter(c => !added.some(a => c.path === `routes.${a.route}.${a.day}.${a.field}` || c.path.startsWith(`routes.${a.route}.${a.day}.${a.field}.`)));
  return {
    ok: false,
    added,
    changes,
    reason: changes.length > 0
      ? `${changes.length} field(s) other than added weekend p/t/tp differ (first: ${changes[0].path})`
      : 'bytes differ outside the added weekend fields (key order or number formatting)',
  };
}

export function sha256Hex(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex');
}

/**
 * The immutable backup key of a replaced sidecar: under its own prefix (never listed by build-history, which reads
 * history-v2/), by ticket, with the old body's hash so two different old bodies can never share a key.
 */
export function replacementBackupKey(ticket: string, key: string, oldBody: string): string {
  const rest = key.replace(/^history-v2\//, '');
  return `history-v2-replaced/${ticket}/${rest.replace(/\.json$/, '')}.${sha256Hex(oldBody).slice(0, 16)}.json`;
}

/** Counts of added fields by day and field, e.g. {"sat.p": 120, "sat.tp": 31}. */
export function countAdded(added: AddedField[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of added) out[`${a.day}.${a.field}`] = (out[`${a.day}.${a.field}`] ?? 0) + 1;
  return out;
}
