import {
  HISTORY_V2_BASE_OVERRIDE,
  historyV2AgencyUrl,
  historyV2SidecarUrl,
  historyV2ShapesUrl,
  parseHistoryAgencyV2,
  parseHistoryShapes,
  parseHistoryV2Sidecar,
  type HistoryAgencyLike,
  type HistorySnapshotLike,
  type HistoryShapesFile,
  type HistoryV2Result,
  type HistoryV2Sidecar,
} from '../../shared/historyV2Reader';
import { R2_PUBLIC_URL } from '../../shared/config';
import { loadHistoryConfig } from './historyConfig';

/** Thin fetch layer over the pure reader. Fixture mode is on only when VITE_HISTORY_V2_BASE is set in `vite` dev. */
export const historyV2FixtureMode = (): boolean => HISTORY_V2_BASE_OVERRIDE !== undefined;

async function getJson(url: string): Promise<HistoryV2Result<unknown>> {
  try {
    const r = await fetch(url);
    if (!r.ok) return { ok: false, error: { code: 'missing-field', path: url, message: `HTTP ${r.status}` } };
    return { ok: true, value: await r.json() };
  } catch (e) {
    return { ok: false, error: { code: 'not-object', path: url, message: e instanceof Error ? e.message : 'fetch failed' } };
  }
}

/**
 * One agency's history (validated). Fixture mode reads {base}/{slug}-v2-agency.json; otherwise it
 * takes the agency from the shared history-config.json (same fetch the History screen uses).
 */
export async function loadHistoryAgencyV2<S extends HistorySnapshotLike = HistorySnapshotLike>(slug: string): Promise<HistoryV2Result<HistoryAgencyLike<S>>> {
  if (HISTORY_V2_BASE_OVERRIDE) {
    const raw = await getJson(historyV2AgencyUrl(HISTORY_V2_BASE_OVERRIDE, slug));
    return raw.ok ? parseHistoryAgencyV2<S>(raw.value) : raw;
  }
  try {
    const found = (await loadHistoryConfig()).find(a => a.slug === slug);
    if (!found) return { ok: false, error: { code: 'missing-field', path: slug, message: 'agency not in history-config.json' } };
    return parseHistoryAgencyV2<S>(found);
  } catch (e) {
    return { ok: false, error: { code: 'not-object', path: slug, message: e instanceof Error ? e.message : 'fetch failed' } };
  }
}

/** One sidecar. Only available in fixture mode (sidecars are build inputs, not served publicly). */
export async function loadHistoryV2Sidecar(slug: string, periodKey: string): Promise<HistoryV2Result<HistoryV2Sidecar>> {
  if (!HISTORY_V2_BASE_OVERRIDE) return { ok: false, error: { code: 'missing-field', path: periodKey, message: 'sidecars are only served in fixture mode' } };
  const raw = await getJson(historyV2SidecarUrl(HISTORY_V2_BASE_OVERRIDE, slug, periodKey));
  return raw.ok ? parseHistoryV2Sidecar(raw.value) : raw;
}

/**
 * One agency's per-year route shapes (validated), loaded on demand: a separate file, never part of the snapshots
 * the screen loads eagerly. Fixture mode reads {base}/{slug}-v2-shapes.json; otherwise the published
 * `atlas/history-v2-shapes/{slug}.json` (absent until a v2 build has published it: the result is then
 * {ok:false} and every route reads as `shapeForYear` none). Pair with `shapeForYear` from the reader.
 */
export async function loadHistoryShapesV2(slug: string): Promise<HistoryV2Result<HistoryShapesFile>> {
  const url = HISTORY_V2_BASE_OVERRIDE ? historyV2ShapesUrl(HISTORY_V2_BASE_OVERRIDE, slug) : `${R2_PUBLIC_URL}/atlas/history-v2-shapes/${encodeURIComponent(slug)}.json`;
  const raw = await getJson(url);
  return raw.ok ? parseHistoryShapes(raw.value) : raw;
}
