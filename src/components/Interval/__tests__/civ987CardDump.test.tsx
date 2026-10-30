/**
 * CIV-987 proof harness, run on request only (skipped unless CIV987_DUMP is set):
 *   CIV987_DUMP=<out dir> CIV987_DATA=<dir of agency JSONs> npx vitest run src/components/Interval/__tests__/civ987CardDump.test.tsx
 * Renders the real route card for every route, day and period of each agency file, in the normal, Compare and Night
 * modes, and writes each card's markup and every row's hover payload, one gzip per agency. Two runs are compared with
 * scripts outside the repo (_reports/civ987/): a refactor step must leave them identical.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { describe, it } from 'vitest';
import type { HoveredBranch, ShapeProperties, TimePeriod } from '../../../hooks/useIntervalStats';
import { RouteCardHeadway } from '../panels/RouteCardHeadway';
import { buildCurrentRoute, routeVariantFamily } from '../../../utils/routeCardRoute';
import { buildDirectionGroups, routeDirectionOverrides } from '../../../utils/routeCardDirectionGroups';
import { buildRouteFacts } from '../../../utils/routeFacts';
import { TIME_PERIODS } from '../../../../shared/config';
import { featurePassesHeadwayFilter } from '../../../../shared/routeHeadwayFilter';

const OUT = process.env.CIV987_DUMP;
const DATA = process.env.CIV987_DATA;
const ONLY = process.env.CIV987_ONLY?.split(',');
const PERIODS = [...TIME_PERIODS.map(p => p.key), 'all'] as TimePeriod[];
const index = OUT ? JSON.parse(fs.readFileSync('public/data/index.json', 'utf8')) as { agencies: Array<Record<string, any>> } : { agencies: [] };

// React's generated ids (useId) are the only markup that may differ between two runs of the same code.
const normalize = (html: string) => html.replace(/:r[0-9a-z]+:/g, ':r:').replace(/«r[0-9a-z]+»/g, '«r»');

describe.skipIf(!OUT || !DATA)('CIV-987 card dump', () => {
  const slugs = (ONLY ?? fs.readdirSync(DATA ?? '.').filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''))).sort();
  for (const slug of slugs) {
    it(slug, () => {
      const fc = JSON.parse(fs.readFileSync(path.join(DATA!, `${slug}.json`), 'utf8')) as GeoJSON.FeatureCollection;
      const layers = { [slug]: fc };
      const agency = index.agencies.find(a => a.slug === slug);
      const lines: string[] = [];
      const routeFeatures = fc.features.filter(f => (f.properties as ShapeProperties | null)?.routeId);
      const days = [...new Set(routeFeatures.map(f => (f.properties as ShapeProperties).day ?? 'Weekday'))].sort();
      for (const day of days) {
        const keys = [...new Set(routeFeatures
          .filter(f => ((f.properties as ShapeProperties).day ?? 'Weekday') === day)
          .map(f => buildRouteFacts({ ...(f.properties as ShapeProperties), agencySlug: slug } as ShapeProperties).key))].sort();
        for (const key of keys) {
          for (const mode of ['normal', 'compare', 'night', 'filter15'] as const) {
            const periods = mode === 'night' ? (['all'] as TimePeriod[]) : mode === 'filter15' ? (['midday', 'all'] as TimePeriod[]) : PERIODS;
            for (const period of periods) {
              const currentRoute = buildCurrentRoute(key, layers, day as any, period);
              if (!currentRoute) continue;
              const overrides = routeDirectionOverrides(index.agencies as any, slug, currentRoute.routeShortName);
              const groups = buildDirectionGroups(currentRoute, period, overrides.directionLabels, overrides.directionHeadsigns);
              const maxHeadway = mode === 'filter15' ? 15 : Infinity;
              const outOfFilter = mode === 'filter15' && currentRoute.directions.some(d => !featurePassesHeadwayFilter(d, period, 15));
              const hovers: Array<HoveredBranch | null> = [];
              const card = (hoveredBranch: HoveredBranch | null) => (
                <RouteCardHeadway
                  currentRoute={currentRoute as any}
                  agencyFeatures={fc.features}
                  stableBranchColors={mode === 'compare'}
                  variantFamily={routeVariantFamily(currentRoute, layers, day as any, period)}
                  routeSlug={slug}
                  routeAgency={agency as any}
                  setSelectedAgencySlug={() => {}}
                  setSelectedRoute={() => {}}
                  back={undefined}
                  maxHeadway={maxHeadway}
                  period={period}
                  setPeriod={() => {}}
                  directionGroups={groups}
                  hideSpan={false}
                  routeIsStale={false}
                  selectedRouteOutOfFilter={outOfFilter}
                  hideFilterNotices={mode === 'night'}
                  nightView={mode === 'night'}
                  expDateStr=""
                  hoveredBranch={hoveredBranch}
                  setHoveredBranch={h => { hovers.push(h as HoveredBranch | null); }}
                />
              );
              const { container, rerender } = render(card(null));
              const html = normalize(container.innerHTML);
              // Every row that lights the map on hover: what it sends.
              container.querySelectorAll('[class*="-mx-1 px-1 py-0.5"]').forEach(row => {
                fireEvent.mouseEnter(row);
                fireEvent.mouseLeave(row);
              });
              // The card while each of those rows is hovered (dimming, the chart's selected branch), on the normal card.
              const hoveredHtml = mode === 'normal' && (period === 'midday' || period === 'all')
                ? hovers.filter((h): h is HoveredBranch => h != null).map(h => {
                  rerender(card(h));
                  return createHash('sha1').update(normalize(container.innerHTML)).digest('hex');
                })
                : [];
              lines.push(JSON.stringify({ day, key, mode, period, html, hovers, hoveredHtml }));
              cleanup();
            }
          }
        }
      }
      fs.mkdirSync(OUT!, { recursive: true });
      fs.writeFileSync(path.join(OUT!, `${slug}.jsonl.gz`), zlib.gzipSync(lines.join('\n')));
    }, 3_600_000);
  }
});
