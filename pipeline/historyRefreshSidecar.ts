/**
 * The weekly refresh's History v2 sidecar (CIV-1101 Part B), split out of refresh.ts so it can be
 * tested: refresh.ts runs its whole pipeline on import.
 *
 * The sidecar reads the week the processor read for each feed (ProcessResult.referenceDate), never
 * a second pick. Sidecars are immutable per period, and the picked week moves with the run date, so
 * a feed reprocessed unchanged reads a later week of the same period: the first sidecar for the
 * period is kept (as main did, where the old picker gave the same zip the same date) and logged.
 */
import { buildSidecar, buildV2RoutesMerged, sidecarKey, splitFeaturesBySource, writeSidecar, type HistoryV2Sink, type V2FeedPart } from './historyV2.js';
import { readFeedEvidence } from './historyWeekend.js';
import { readPickedWeekQuality } from './historyRefQuality.js';
import type { AgencyFeedResult } from './agencyFeeds.js';
import type { HistoryV2Sidecar } from '../shared/historyV2.js';

export interface HistoryV2Input {
  buf: Buffer;
  /** The date the processor read for the main feed, and its week's Monday (null on the old picker). */
  referenceDate: string;
  serviceWeekStart: string | null;
  /** The same for each supplemental feed, by url. */
  supplementalReferenceDates?: Record<string, string>;
  /** Supplemental feeds (e.g. rail) and which merged features came from which feed. */
  supplemental?: Array<{ url: string; buf: Buffer }>;
  featureSources?: Array<{ url: string | null; count: number }>;
}

/** The sidecar input from one processAgencyFeeds result, as refresh passes it. */
export function historyV2InputFor(primary: Pick<AgencyFeedResult, 'referenceDate' | 'serviceWeekStart' | 'supplementalFeatureCounts' | 'featureSources'>, buf: Buffer, supplementalFeeds: ReadonlyArray<{ url: string; buf: Buffer }>): HistoryV2Input {
  return {
    buf,
    referenceDate: primary.referenceDate,
    serviceWeekStart: primary.serviceWeekStart,
    supplementalReferenceDates: Object.fromEntries(primary.supplementalFeatureCounts.map(f => [f.url, f.referenceDate])),
    supplemental: supplementalFeeds.map(f => ({ url: f.url, buf: f.buf })),
    featureSources: primary.featureSources,
  };
}

export interface RefreshSidecarResult {
  sidecar: HistoryV2Sidecar;
  /** The routes the period's change check reads: this run's, or the kept sidecar's. */
  routes: HistoryV2Sidecar['routes'];
  /** Appended to the refresh log line (collisions, a kept sidecar). */
  note: string;
}

export async function writeRefreshSidecar(
  slug: string,
  periodKey: string,
  features: Array<{ properties: Record<string, unknown> }>,
  v2Input: HistoryV2Input,
  store: { sink: HistoryV2Sink; peek: (key: string) => Promise<string | null> },
): Promise<RefreshSidecarResult> {
  const evidence = await readFeedEvidence(v2Input.buf, { referenceDate: v2Input.referenceDate });
  // The merged features already hold the supplemental feeds' routes; split them back by feed so
  // each is built with its own calendar evidence, and a clash with the main feed is reported.
  const supplementalBufs = new Map((v2Input.supplemental ?? []).map(f => [f.url, f.buf]));
  const parts: V2FeedPart[] = [];
  for (const part of splitFeaturesBySource(features, v2Input.featureSources)) {
    if (part.url === null) { parts.push({ url: null, features: part.features, evidence }); continue; }
    const partBuf = supplementalBufs.get(part.url);
    if (!partBuf) { parts.push({ url: part.url, features: part.features, evidence: undefined }); continue; }
    // Never re-pick a week here: a supplemental without the processor's date is a caller bug.
    const referenceDate = v2Input.supplementalReferenceDates?.[part.url];
    if (!referenceDate) throw new Error(`${slug}: no processor reference date for supplemental feed ${part.url}; History sidecar not written`);
    parts.push({ url: part.url, features: part.features, evidence: await readFeedEvidence(partBuf, { referenceDate }) });
  }
  const built = buildV2RoutesMerged(parts);
  let note = built.collisions.length > 0
    ? `; ${built.collisions.length} route-key collision(s) between feeds, earlier feed's route kept: ${built.collisions.map(c => `${c.key} (${c.droppedFrom} dropped)`).join(', ')}`
    : '';
  const sidecar = buildSidecar(slug, periodKey, evidence.refDate, built.routes, built.supplementalRoutes);
  // The week was picked by vote (a holiday is a day that loses it), so no holiday flag is computed.
  sidecar.refDateQuality = await readPickedWeekQuality(v2Input.buf, evidence.refDate, v2Input.serviceWeekStart);
  let routes = built.routes;
  if (await writeSidecar(store.sink, sidecar) === 'conflict') {
    const raw = await store.peek(sidecarKey(slug, periodKey));
    const kept = raw ? JSON.parse(raw) as HistoryV2Sidecar : null;
    if (kept?.routes) routes = kept.routes;
    note += kept && kept.refDate !== sidecar.refDate
      ? `; unchanged feed, sidecar kept (period ${periodKey} read ${kept.refDate}; this run read ${sidecar.refDate})`
      : `; History sidecar ${periodKey} differs from the one already written at the same week; sidecar kept`;
  }
  return { sidecar, routes, note };
}
