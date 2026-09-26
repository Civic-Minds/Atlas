#!/usr/bin/env npx tsx
/**
 * Build the deterministic agency sample and research ledger for the
 * lateness-policy study. This only writes research artifacts; it never writes
 * Atlas data or changes production tolerance rules.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SEED = 20260926;
const OUTPUT_DIR = resolve(ROOT, 'docs/research/agency-lateness-policy-study-2026-09');
const JSON_OUTPUT = resolve(ROOT, 'docs/research/agency-lateness-policy-study-2026-09.json');
const MARKDOWN_OUTPUT = resolve(ROOT, 'docs/research/agency-lateness-policy-study-2026-09.md');
const DATA_DIR = resolve(ROOT, 'tmp/route-accuracy-reprocess-2026-09-26');

type CatalogRecord = {
  agencyId: string;
  country?: string;
  reviewStatus?: string;
};

type Agency = {
  slug: string;
  name: string;
  region?: string;
  feedQuality?: { metrics?: { featureCount?: number } };
};

type StudyRecord = {
  slug: string;
  name: string;
  country: string;
  region: string | null;
  selectionStratum: string;
  sizeBand: 'small' | 'medium' | 'large' | 'unknown';
  modeFamily: 'bus' | 'rail' | 'mixed' | 'unknown';
  schedulePunctuality: { status: 'not_reviewed' | 'definition_found' | 'not_found' | 'inaccessible'; definition: string | null; sourceIds: string[]; notes: string[] };
  headwayReliability: { status: 'not_reviewed' | 'definition_found' | 'not_found' | 'inaccessible'; definition: string | null; sourceIds: string[]; notes: string[] };
  sources: Array<{ id: string; url: string; title: string; publisher: string; sourceType: string; accessedAt: string; pagesOrSections: string | null }>;
  notes: string[];
};

const VERIFIED: Record<string, {
  schedule: { definition: string; notes: string[]; sourceIds: string[] };
  headway?: { definition: string; notes: string[]; sourceIds: string[] };
  sources: StudyRecord['sources'];
}> = {
  brampton: {
    schedule: {
      definition: 'Brampton defines an on-time bus as service delivered between 3 minutes early and 5 minutes late from the scheduled time, with a 90% target.',
      notes: [],
      sourceIds: ['brampton-otp'],
    },
    sources: [{ id: 'brampton-otp', url: 'https://performancedashboard.brampton.ca/transit-mobility/transit-on-time-performance/', title: 'Transit On-Time Performance', publisher: 'City of Brampton', sourceType: 'performance-dashboard', accessedAt: '2026-09-26', pagesOrSections: 'How is this measured?' }],
  },
  grt: {
    schedule: {
      definition: 'Grand River Transit requires no early departures and allows 0–3 minutes late for 90–95% of service, depending on route type and time period; express routes have a 95% target, while other routes have a 90% weekday-peak and 95% off-peak target.',
      notes: ['This is a time-period and route-type-specific policy, not one network-wide percentage.'],
      sourceIds: ['grt-business-plan'],
    },
    sources: [{ id: 'grt-business-plan', url: 'https://www.regionofwaterloo.ca/en/regional-government/resources/PW/APA2015-0811.pdf', title: 'GRT Business Plan On-Time Performance Service Standard', publisher: 'Region of Waterloo', sourceType: 'service-standard', accessedAt: '2026-09-26', pagesOrSections: 'Appendix A, On-time Performance' }],
  },
  hamilton: {
    schedule: {
      definition: 'Hamilton HSR defines on-time service as no more than 2 minutes early and no more than 5 minutes late compared with the published schedule.',
      notes: [],
      sourceIds: ['hamilton-otp'],
    },
    sources: [{ id: 'hamilton-otp', url: 'https://www.hamilton.ca/index.php/search?page=1251%2C78%2C699%2C167%2C3%2C216%2C44', title: 'HSR Bus On Time Service', publisher: 'City of Hamilton', sourceType: 'service-definition', accessedAt: '2026-09-26', pagesOrSections: 'HSR Bus On Time Service search result' }],
  },
  london: {
    schedule: {
      definition: 'London’s rapid-transit planning report treats timepoints within 0–5 minutes of scheduled departures as on time; later departures are late. It also identifies trips departing more than 20 minutes after their first scheduled departure as missed trips.',
      notes: ['This source is a rapid-transit planning report rather than a complete conventional-bus network policy.'],
      sourceIds: ['london-rapid-transit'],
    },
    sources: [{ id: 'london-rapid-transit', url: 'https://london.ca/sites/default/files/2026-04/Rapid%20Transit%20Readiness%20and%20Route%20Planning%20Report%20-%20May%202026.pdf', title: 'Rapid Transit Readiness & Route Planning', publisher: 'City of London', sourceType: 'planning-report', accessedAt: '2026-09-26', pagesOrSections: 'Monitoring and Key Performance Indicators' }],
  },
  niagara: {
    schedule: {
      definition: 'Niagara’s fixed-route guideline says vehicles should be no more than 1 minute early and no more than 5 minutes late at published timing points, 90% of the time; buses should not depart early from published timing points.',
      notes: ['The same source separately proposes demand-responsive windows, which are not used for fixed-route Atlas comparisons.'],
      sourceIds: ['niagara-service-governance'],
    },
    sources: [{ id: 'niagara-service-governance', url: 'https://www.niagararegion.ca/priorities/documents/transit-service-and-governance-strategy-final-report.pdf', title: 'Niagara Transit Service and Governance Strategy', publisher: 'Niagara Region', sourceType: 'service-guideline', accessedAt: '2026-09-26', pagesOrSections: 'On-Time Performance Guideline' }],
  },
  sudbury: {
    schedule: {
      definition: 'Greater Sudbury’s service standard targets 90% schedule adherence, with buses on time when no more than 3 minutes late; buses should not leave published time points early.',
      notes: ['A later action-plan discussion considers changing the standard to zero minutes early and five minutes late, so the source set records both the current stated standard and the proposed revision.'],
      sourceIds: ['sudbury-service-standard', 'sudbury-action-plan'],
    },
    sources: [
      { id: 'sudbury-service-standard', url: 'https://pub-greatersudbury.escribemeetings.com/filestream.ashx?documentid=12728', title: 'Greater Sudbury Transit service standards', publisher: 'City of Greater Sudbury', sourceType: 'service-standard', accessedAt: '2026-09-26', pagesOrSections: 'Schedule adherence' },
      { id: 'sudbury-action-plan', url: 'https://pub-greatersudbury.escribemeetings.com/filestream.ashx?documentid=6786', title: 'Draft Greater Sudbury Transit Action Plan', publisher: 'City of Greater Sudbury', sourceType: 'action-plan', accessedAt: '2026-09-26', pagesOrSections: 'Schedule Adherence by Route' },
    ],
  },
  go: {
    schedule: {
      definition: 'GO defines train on-time performance as arrival at the terminating destination within 5 minutes of schedule for journeys under 90 minutes, or within 10 minutes for journeys over 90 minutes.',
      notes: ['This is a terminal-arrival rule, not a route headway rule.'],
      sourceIds: ['go-good-to-go'],
    },
    sources: [{ id: 'go-good-to-go', url: 'https://www.gotransit.com/en/travelling-on-go/good-to-go', title: 'You’re Good to GO', publisher: 'GO Transit', sourceType: 'service-policy', accessedAt: '2026-09-26', pagesOrSections: 'GO train on-time performance footnote' }],
  },
  'rtd-denver': {
    schedule: {
      definition: 'RTD considers a vehicle on time when it is less than 1 minute early or no more than 5 minutes late at a stop or station.',
      notes: ['The same window is stated for bus and rail.'],
      sourceIds: ['rtd-otp'],
    },
    sources: [{ id: 'rtd-otp', url: 'https://www.rtd-denver.com/public-information-dashboards/on-time-performance', title: 'On-Time Performance', publisher: 'RTD-Denver', sourceType: 'on-time-policy', accessedAt: '2026-09-26', pagesOrSections: 'On-Time Performance definition' }],
  },
  cota: {
    schedule: {
      definition: 'COTA considers a vehicle late when it arrives 5 minutes or more after the scheduled time.',
      notes: ['The source describes an on-time performance standard but does not define headway tolerance.'],
      sourceIds: ['cota-service-planning'],
    },
    sources: [{ id: 'cota-service-planning', url: 'https://www.cota.com/static/94322f6ed0d3f27c471f1e34f49cf911/COTA_SLR_Report_Appendices_20200610_reduced.pdf', title: 'E Service Planning', publisher: 'Central Ohio Transit Authority', sourceType: 'service-standard', accessedAt: '2026-09-26', pagesOrSections: 'On-time performance standards' }],
  },
  nfta: {
    schedule: {
      definition: 'NFTA’s Title VI program says fixed-route service is on time when it departs a scheduled stop up to 2 minutes early or up to 5 minutes late. An earlier performance report defines Metro Bus arrivals as less than 2 minutes early and less than 4 minutes late, and Metro Rail as less than 1 minute late.',
      notes: ['The official documents do not use one stable window across all modes and reporting periods; this is a documented policy discrepancy, not a single normalized rule.'],
      sourceIds: ['nfta-title-vi', 'nfta-performance-2023'],
    },
    sources: [
      { id: 'nfta-title-vi', url: 'https://cms.nfta.com/media/0wfhzrzh/nfta-title-vi-program-2024.pdf', title: 'NFTA Title VI Program 2024', publisher: 'Niagara Frontier Transportation Authority', sourceType: 'service-standard', accessedAt: '2026-09-26', pagesOrSections: 'On-Time Performance' },
      { id: 'nfta-performance-2023', url: 'https://www.nfta.com/sites/default/files/DocLibMediaFileUpload/Annual%20Reports/Performance%20Reports/2023-nfta-performance-report.pdf', title: '2023 Performance Report', publisher: 'NFTA Metro', sourceType: 'performance-report', accessedAt: '2026-09-26', pagesOrSections: 'On-Time Calculation' },
    ],
  },
  ladot: {
    schedule: {
      definition: 'LADOT publishes an 85% on-time performance standard for DASH and Commuter Express, but the reviewed source does not provide a minute-based early/late window.',
      notes: ['This is a performance target, not a definition of an individual late trip.'],
      sourceIds: ['ladot-title-vi'],
    },
    sources: [{ id: 'ladot-title-vi', url: 'https://www.ladottransit.com/pdf/titlevi/LADOT_Transit_2021_Title_VI_Report.pdf', title: 'LADOT Transit 2021 Title VI Report', publisher: 'City of Los Angeles Department of Transportation', sourceType: 'performance-standard', accessedAt: '2026-09-26', pagesOrSections: 'On-Time Performance Standards' }],
  },
};

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ state >>> 15, 1 | state);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function countryFor(slug: string, catalog: Map<string, CatalogRecord>): string {
  return catalog.get(slug)?.country ?? 'Unknown';
}

function sizeBand(featureCount: number | undefined): StudyRecord['sizeBand'] {
  if (!Number.isFinite(featureCount)) return 'unknown';
  if ((featureCount ?? 0) < 500) return 'small';
  if ((featureCount ?? 0) < 2500) return 'medium';
  return 'large';
}

function modeFamily(slug: string, name: string): StudyRecord['modeFamily'] {
  const text = `${slug} ${name}`.toLowerCase();
  if (/(rail|metro|subway|tram|streetcar|train|rer|u-?bahn|s-?bahn)/.test(text)) return 'rail';
  if (/(go transit|regional|transit authority|transportation commission)/.test(text)) return 'mixed';
  return 'bus';
}

function main() {
  const index = JSON.parse(readFileSync(resolve(ROOT, 'public/data/index.json'), 'utf8')) as { agencies: Agency[] };
  const catalog = JSON.parse(readFileSync(resolve(ROOT, 'docs/research/frequent-service-catalog.json'), 'utf8')) as { agencies: CatalogRecord[] };
  const catalogBySlug = new Map(catalog.agencies.map(record => [record.agencyId, record]));
  const eligible = index.agencies.filter(agency => ['Canada', 'United States', 'France'].includes(countryFor(agency.slug, catalogBySlug)));
  const quotas = new Map([['Canada', 20], ['United States', 40], ['France', 20]]);
  const random = seededRandom(SEED);
  const selected: Agency[] = [];

  for (const [country, quota] of quotas) {
    const pool = shuffle(eligible.filter(agency => countryFor(agency.slug, catalogBySlug) === country), random);
    const byReviewStatus = new Map<string, Agency[]>();
    for (const agency of pool) {
      const status = catalogBySlug.get(agency.slug)?.reviewStatus ?? 'not_in_catalog';
      const bucket = byReviewStatus.get(status) ?? [];
      bucket.push(agency);
      byReviewStatus.set(status, bucket);
    }
    const buckets = shuffle([...byReviewStatus.values()], random);
    while (selected.filter(agency => countryFor(agency.slug, catalogBySlug) === country).length < quota && buckets.length > 0) {
      for (const bucket of [...buckets]) {
        const agency = bucket.shift();
        if (!agency) { buckets.splice(buckets.indexOf(bucket), 1); continue; }
        selected.push(agency);
        if (selected.filter(candidate => countryFor(candidate.slug, catalogBySlug) === country).length >= quota) break;
      }
    }
  }

  if (selected.length !== 80) throw new Error(`Expected 80 agencies, selected ${selected.length}`);
  const records: StudyRecord[] = selected.map(agency => {
    const sourcePath = resolve(DATA_DIR, `${agency.slug}.json`);
    let featureCount = agency.feedQuality?.metrics?.featureCount;
    if (existsSync(sourcePath)) {
      const artifact = JSON.parse(readFileSync(sourcePath, 'utf8')) as { features?: unknown[] };
      featureCount = artifact.features?.length ?? featureCount;
    }
    const country = countryFor(agency.slug, catalogBySlug);
    const verified = VERIFIED[agency.slug];
    return {
      slug: agency.slug,
      name: agency.name,
      country,
      region: agency.region ?? null,
      selectionStratum: `${country} / ${catalogBySlug.get(agency.slug)?.reviewStatus ?? 'not_in_catalog'}`,
      sizeBand: sizeBand(featureCount),
      modeFamily: modeFamily(agency.slug, agency.name),
      schedulePunctuality: verified
        ? { status: 'definition_found', definition: verified.schedule.definition, sourceIds: verified.schedule.sourceIds, notes: verified.schedule.notes }
        : { status: 'not_reviewed', definition: null, sourceIds: [], notes: [] },
      headwayReliability: verified?.headway
        ? { status: 'definition_found', definition: verified.headway.definition, sourceIds: verified.headway.sourceIds, notes: verified.headway.notes }
        : { status: 'not_reviewed', definition: null, sourceIds: [], notes: [] },
      sources: verified?.sources ?? [],
      notes: [],
    };
  });

  const study = {
    studyVersion: '2026-09-26.v1',
    checkedAt: new Date().toISOString(),
    sampleSeed: SEED,
    targetAgencyCount: 80,
    sampleQuotas: Object.fromEntries(quotas),
    purpose: 'Research agency definitions of schedule lateness and service-spacing reliability before changing Atlas tolerance rules.',
    sourcePolicy: 'Official agency sources first; record not_found or inaccessible instead of inferring a policy.',
    atlasBaseline: { minimumGraceMinutes: 5, gracePercent: 0.15, maxGraceViolations: 2, violationPercent: 0.30 },
    records,
  };

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(JSON_OUTPUT, `${JSON.stringify(study, null, 2)}\n`);
  const lines = [
    '# Agency lateness and headway policy study', '',
    `- Study version: \`${study.studyVersion}\``,
    `- Sample seed: \`${SEED}\``,
    '- Sample: 80 agencies — Canada 20, United States 40, France 20',
    '- Scope: schedule punctuality and headway/frequency reliability, recorded separately',
    `- Status: sample initialized; ${Object.keys(VERIFIED).length} agency schedule-policy records have verified official sources`,
    '',
    '## Method', '',
    'This exploratory study records how agencies themselves define lateness, on-time performance, acceptable headway, bunching, and service reliability. It does not treat an agency frequency promise as an on-time rule, and it does not change Atlas production logic.',
    '',
    'Each agency must end with either an official definition, an explicit no-definition-found result, or an inaccessible-source result. Sources must include a URL, title, publisher, access date, and page or section when applicable.',
    '',
    '## Atlas baseline', '',
    'The current pipeline baseline is a minimum 5-minute grace, a 15% grace component, up to 2 grace violations, and a 30% violation allowance. This study evaluates that baseline; it does not alter it.',
    '',
    '## Initial verified findings', '',
    '- Niagara uses −1/+5 minutes at published timing points with a 90% target; Greater Sudbury uses no early departures and no more than 3 minutes late with a 90% target.',
    '- GO Transit uses a 5-minute terminal-arrival window for journeys under 90 minutes and 10 minutes for longer journeys.',
    '- RTD-Denver uses less than 1 minute early or up to 5 minutes late for bus and rail.',
    '- COTA defines a late arrival as 5 minutes or more after schedule.',
    '- NFTA publishes different official windows across documents and modes; the study records that discrepancy instead of flattening it.',
    '- LADOT publishes an 85% on-time performance target but no minute-based late-trip window in the reviewed source.',
    '',
    '## Sample', '',
    '| Agency | Country | Region | Size | Mode | Selection stratum | Schedule policy | Headway policy |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...records.map(record => `| ${record.name} | ${record.country} | ${record.region ?? '—'} | ${record.sizeBand} | ${record.modeFamily} | ${record.selectionStratum} | ${record.schedulePunctuality.status} | ${record.headwayReliability.status} |`),
    '',
    '## Research ledger', '',
    'The structured ledger is [agency-lateness-policy-study-2026-09.json](agency-lateness-policy-study-2026-09.json). The official-source review must replace each `not_reviewed` status with `definition_found`, `not_found`, or `inaccessible` and add source-backed notes.',
  ];
  writeFileSync(MARKDOWN_OUTPUT, `${lines.join('\n')}\n`);
  console.log(`Wrote ${JSON_OUTPUT}`);
  console.log(`Wrote ${MARKDOWN_OUTPUT}`);
}

main();
