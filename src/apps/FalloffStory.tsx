import { useId } from 'react';
import ChartTableDetails from '../components/charts/ChartTableDetails';
import DotPairs, { DotPairKey, type DotPair } from '../components/charts/DotPairs';
import TileMap, { type MapTile } from '../components/charts/TileMap';
import { useActivePart } from '../components/charts/useActivePart';
import ResearchHeader from '../components/research/ResearchHeader';
import ResearchMethod from '../components/research/ResearchMethod';
import type { DataTableColumn } from '../components/ui/DataTable';
import PageShell from '../components/ui/PageShell';
import { REGION_TILES } from '../data/regionTileGrid';
import { FALLOFF_MINUTES, FREQUENT_MORNING_MIN, FALLOFF_TIMES, HOLD_SHARE, MORNING, SUNDAY_EVENING, falloffStudy, gthaAgencies, holdingNetworks, noSundayRegions, noneOnSundayEvening, periodHours, steepestDrops, whenLabel, type FalloffAgency } from '../data/falloffStory';
import { STORY_CHART_PANEL, STORY_HEADING, STORY_PARAGRAPH } from '../pages/pageStyles';
import { longDate } from '../../shared/dateText';
import { headwayOrBetter } from '../../shared/headwayText';
import { countText, decimalText, percentText } from '../../shared/numberText';
import { FALLOFF_STORY } from '../../shared/researchStories';
import { AGENCY_COLUMN, FALLOFF_TABLE_COLUMNS } from '../content/noticeCopy';

/**
 * #1074 (CIV-770): how much frequent service is left on Sunday evening, against a weekday morning. On the Frequent service
 * story's switch (FEATURES.falloffStory), on the Frequent service story's page pattern and shared charts. Every UI word here is a draft for
 * Ryan's word-for-word OK; the figures come from falloff-story.json.
 */

/** "10.1%": a study share (already in percent) to one decimal. */
const pct = (share: number) => `${decimalText(share, 1)}%`;
const MORNING_LABEL = whenLabel(MORNING.day, MORNING.period);
const SUNDAY_LABEL = whenLabel(SUNDAY_EVENING.day, SUNDAY_EVENING.period);
const all = falloffStudy.all;
const [canada, unitedStates] = falloffStudy.countries;
/** The share of the morning's frequent route-km that is gone by Sunday evening (0–1). */
const lostShare = 1 - all.sundayEvening / all.weekdayMorning;
const kept = (c: { weekdayMorning: number; sundayEvening: number }) => c.sundayEvening / c.weekdayMorning;

/** A pair for the dot charts: shares are in percent in the study, and 0–1 on the chart. */
const pair = (key: string, label: string, morning: number, sunday: number, reference = false): DotPair => ({
  key, label, first: morning / 100, second: sunday / 100, reference,
  sentence: `${label}: ${MORNING_LABEL} ${pct(morning)}, ${SUNDAY_LABEL} ${pct(sunday)}`,
});
const agencyPair = (a: FalloffAgency) => pair(a.slug, a.name, a.weekdayMorning, a.sundayEvening);
const allPair = (label: string) => pair('all', label, all.weekdayMorning, all.sundayEvening, true);

const AGENCY_COLUMNS: DataTableColumn<FalloffAgency>[] = [
  { key: 'agency', header: AGENCY_COLUMN, cell: a => a.name, rowHeader: true, className: 'font-normal', width: 12 },
  { key: 'morning', header: MORNING_LABEL, cell: a => pct(a.weekdayMorning), width: 7 },
  { key: 'sunday', header: SUNDAY_LABEL, cell: a => pct(a.sundayEvening), width: 7 },
];
type TimeRow = (typeof FALLOFF_TIMES)[number];
const TIME_COLUMNS: DataTableColumn<TimeRow>[] = [
  { key: 'when', header: FALLOFF_TABLE_COLUMNS.when, cell: t => `${whenLabel(t.day, t.period)} (${periodHours(t.period)})`, rowHeader: true, className: 'font-normal', width: 12 },
  { key: 'all', header: FALLOFF_TABLE_COLUMNS.all, cell: t => pct(all[t.key]), width: 6 },
  { key: 'canada', header: canada.country, cell: t => pct(canada[t.key]), width: 6 },
  { key: 'us', header: unitedStates.country, cell: t => pct(unitedStates[t.key]), width: 6 },
];
type RegionRow = (typeof noSundayRegions)[number];
const REGION_COLUMNS: DataTableColumn<RegionRow>[] = [
  { key: 'region', header: FALLOFF_TABLE_COLUMNS.region, cell: r => r.region, rowHeader: true, className: 'font-normal', width: 12 },
  { key: 'none', header: FALLOFF_TABLE_COLUMNS.noSunday, cell: r => r.noSunday, width: 7 },
  { key: 'agencies', header: FALLOFF_TABLE_COLUMNS.agencies, cell: r => r.agencies, width: 6 },
];
const regionTiles: MapTile[] = noSundayRegions.filter(r => REGION_TILES[r.region]).map(r => {
  const { abbr, col, row } = REGION_TILES[r.region];
  return {
    key: r.region, abbr, col, row, value: String(r.noSunday), count: r.agencies,
    fill: r.noSunday > 0 ? 'var(--text-muted)' : 'none', darkFill: r.noSunday > 0,
    sentence: `${r.region}: ${r.noSunday} of ${r.agencies} agencies run no Sunday service.`,
  };
});

export default function FalloffStory() {
  const series = useActivePart();
  const ids = { lede: useId(), drops: useId(), holds: useId(), countries: useId(), gtha: useId(), sunday: useId() };
  const key = <DotPairKey first={MORNING_LABEL} second={SUNDAY_LABEL} series={series} />;
  // The number columns are narrow: their headers name the day only, and the key above names the full time.
  const dots = (label: string, details: string, pairs: DotPair[]) => (
    <DotPairs label={label} details={details} firstHeader={MORNING.day} secondHeader={SUNDAY_EVENING.day} series={series} valueText={share => pct(share * 100)} groups={[{ key: label, pairs }]} />
  );

  const method = (
    <ResearchMethod parts={{
      dateConducted: <>{longDate(falloffStudy.date)}.</>,
      sample: <>Every agency on Atlas’s map: {countText(all.agencies)} agencies in Canada and the United States, with {countText(all.routes)} routes and {countText(all.routeKm)} route-kilometres. The lists name agencies with at least {falloffStudy.minKm} route-kilometres.</>,
      sources: <>Atlas’s published schedules, from each agency’s own schedule data, as of {longDate(falloffStudy.date)}.</>,
      whatCounted: <>A route counts when the map draws it {headwayOrBetter(FALLOFF_MINUTES)} at that time, by the map’s own rule: the less frequent direction decides. Each route counts by the length of its longest drawn pattern. Routes the map hides as irregular are left out. {MORNING_LABEL} is {periodHours(MORNING.period)}; {SUNDAY_LABEL} is {periodHours(SUNDAY_EVENING.period)}.</>,
      limitations: <>These are scheduled trips, not the service that actually ran. A route just past {FALLOFF_MINUTES} minutes doesn’t count, so a network that runs every 16 to 20 minutes on Sunday evening drops out of the figures.</>,
    }} />
  );

  return (
    <PageShell method={method}>
      <article className="pb-16 pt-10 sm:pt-14">
        <ResearchHeader
          width="story"
          title={FALLOFF_STORY.heading}
          intro={<>{FALLOFF_STORY.intro!({ agencies: all.agencies, morning: all.weekdayMorning, sunday: all.sundayEvening, minutes: FALLOFF_MINUTES }).map(text => <p key={text}>{text}</p>)}</>}
        />

        <div className="mx-auto mt-16 max-w-4xl space-y-24 sm:mt-24 sm:space-y-32">
          <section aria-labelledby="falloff-lede-heading" className={`${STORY_CHART_PANEL} p-6 sm:p-10`}>
            <div className="max-w-2xl">
              <h2 id="falloff-lede-heading" className={STORY_HEADING}>Frequent transit is a weekday product.</h2>
              <p className={STORY_PARAGRAPH}>{percentText(lostShare)} of the frequent network on a weekday morning is gone by Sunday evening. At weekday midday it is {pct(all.weekdayMidday)}, and at Saturday midday {pct(all.saturdayMidday)}.</p>
            </div>
            <div className="mt-8">
              {key}
              <div className="mt-6">{dots(`Share of route-kilometres ${headwayOrBetter(FALLOFF_MINUTES)}, all agencies`, ids.lede, [allPair('All agencies')])}</div>
              <ChartTableDetails id={ids.lede} caption="How much is frequent at four times of the week" columns={TIME_COLUMNS} rows={FALLOFF_TIMES} rowKey={t => t.key} />
            </div>
          </section>

          <section aria-labelledby="falloff-drops-heading" className={`${STORY_CHART_PANEL} p-6 sm:p-10`}>
            <div className="max-w-2xl">
              <h2 id="falloff-drops-heading" className={STORY_HEADING}>The steepest drops.</h2>
              <p className={STORY_PARAGRAPH}>These networks lose the most frequent service between a weekday morning and Sunday evening. {countText(noneOnSundayEvening)} agencies that are at least {FREQUENT_MORNING_MIN}% frequent on a weekday morning have no frequent service at all on Sunday evening.</p>
            </div>
            <div className="mt-8">
              {key}
              <div className="mt-6">{dots('The ten steepest drops in frequent service', ids.drops, steepestDrops.map(agencyPair))}</div>
              <ChartTableDetails id={ids.drops} caption="The steepest drops." columns={AGENCY_COLUMNS} rows={steepestDrops} rowKey={a => a.slug} />
            </div>
          </section>

          <section aria-labelledby="falloff-holds-heading" className={`${STORY_CHART_PANEL} p-6 sm:p-10`}>
            <div className="max-w-2xl">
              <h2 id="falloff-holds-heading" className={STORY_HEADING}>A few networks hold.</h2>
              <p className={STORY_PARAGRAPH}>Only {countText(holdingNetworks.length)} large networks keep at least {percentText(HOLD_SHARE)} of their weekday-morning frequent service on Sunday evening. Most of them run rail, which tends to keep its frequency all week.</p>
            </div>
            <div className="mt-8">
              {key}
              <div className="mt-6">{dots('Networks that keep most of their frequent service', ids.holds, holdingNetworks.map(agencyPair))}</div>
              <ChartTableDetails id={ids.holds} caption="A few networks hold." columns={AGENCY_COLUMNS} rows={holdingNetworks} rowKey={a => a.slug} />
            </div>
          </section>

          <section aria-labelledby="falloff-countries-heading" className={`${STORY_CHART_PANEL} p-6 sm:p-10`}>
            <div className="max-w-2xl">
              <h2 id="falloff-countries-heading" className={STORY_HEADING}>Canada keeps more on Sunday.</h2>
              <p className={STORY_PARAGRAPH}>On Sunday evening, {canada.country} keeps {percentText(kept(canada))} of its weekday-morning frequent service, and the {unitedStates.country} {percentText(kept(unitedStates))}.</p>
            </div>
            <div className="mt-8">
              {key}
              <div className="mt-6">{dots('How much is frequent, by country', ids.countries, [
                allPair('All agencies'),
                ...falloffStudy.countries.map(c => pair(c.country, c.country, c.weekdayMorning, c.sundayEvening)),
              ])}</div>
              <ChartTableDetails id={ids.countries} caption="Canada keeps more on Sunday." columns={TIME_COLUMNS} rows={FALLOFF_TIMES} rowKey={t => t.key} />
            </div>
          </section>

          <section aria-labelledby="falloff-gtha-heading" className={`${STORY_CHART_PANEL} p-6 sm:p-10`}>
            <div className="max-w-2xl">
              <h2 id="falloff-gtha-heading" className={STORY_HEADING}>Around Toronto and Hamilton.</h2>
              <p className={STORY_PARAGRAPH}>The TTC keeps most of its frequent network on Sunday evening. Its neighbours mostly don’t.</p>
            </div>
            <div className="mt-8">
              {key}
              <div className="mt-6">{dots('How much is frequent in the Greater Toronto and Hamilton Area', ids.gtha, gthaAgencies.map(agencyPair))}</div>
              <ChartTableDetails id={ids.gtha} caption="Around Toronto and Hamilton." columns={AGENCY_COLUMNS} rows={gthaAgencies} rowKey={a => a.slug} />
            </div>
          </section>

          <section aria-labelledby="falloff-sunday-heading" className={`${STORY_CHART_PANEL} p-6 sm:p-10`}>
            <div className="max-w-2xl">
              <h2 id="falloff-sunday-heading" className={STORY_HEADING}>Some agencies don’t run on Sunday at all.</h2>
              <p className={STORY_PARAGRAPH}>{countText(falloffStudy.sized.noSunday)} of {countText(falloffStudy.sized.agencies)} agencies with at least {falloffStudy.minKm} route-kilometres run no Sunday service. Each square shows how many, out of the agencies in that state or province.</p>
            </div>
            <div className="mt-8">
              <TileMap tiles={regionTiles} label={`Agencies with no Sunday service, for ${regionTiles.length} states and provinces.`} details={ids.sunday} />
              <ChartTableDetails id={ids.sunday} caption="Agencies with no Sunday service, by state and province" columns={REGION_COLUMNS} rows={noSundayRegions} rowKey={r => r.region} />
            </div>
          </section>
        </div>
      </article>
    </PageShell>
  );
}
