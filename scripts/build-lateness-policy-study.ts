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
const JSON_OUTPUT = resolve(ROOT, 'docs/research/agency-lateness-policy-study-2026-09/agency-lateness-policy-study-2026-09.json');
const MARKDOWN_OUTPUT = resolve(ROOT, 'docs/research/agency-lateness-policy-study-2026-09/agency-lateness-policy-study-2026-09.md');
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
  serviceScope: 'static_scheduled';
  excludedPolicyScopes: string[];
  schedulePunctuality: { status: 'not_reviewed' | 'definition_found' | 'not_found' | 'inaccessible'; definition: string | null; sourceIds: string[]; notes: string[] };
  headwayReliability: { status: 'not_reviewed' | 'definition_found' | 'not_found' | 'inaccessible'; definition: string | null; sourceIds: string[]; notes: string[] };
  sources: Array<{ id: string; url: string; title: string; publisher: string; sourceType: string; accessedAt: string; pagesOrSections: string | null }>;
  notes: string[];
};

const VERIFIED: Record<string, {
  schedule: { definition: string | null; status?: 'definition_found' | 'not_found'; notes: string[]; sourceIds: string[] };
  headway?: { definition: string | null; status?: 'definition_found' | 'not_found'; notes: string[]; sourceIds: string[] };
  sources: StudyRecord['sources'];
}> = {
  stl: {
    schedule: {
      definition: 'STL Laval commits to regular-route service being no more than 2 minutes early and no more than 5 minutes late. Its 2025 performance indicator uses a customer boarding window of 30 seconds early to 5 minutes 30 seconds late and a 90.5% target.',
      notes: ['The public quality commitment and the performance-indicator calculation use slightly different windows; both are recorded. The paratransit 30-minute pickup window is excluded.'],
      sourceIds: ['stl-quality-commitment', 'stl-performance-indicators'],
    },
    sources: [
      { id: 'stl-quality-commitment', url: 'https://stlaval.ca/engagement-qualite', title: 'STL Quality Commitment', publisher: 'STL Laval', sourceType: 'customer-commitment', accessedAt: '2026-09-26', pagesOrSections: 'Réseau régulier / Ponctualité' },
      { id: 'stl-performance-indicators', url: 'https://stlaval.ca/gouvernance/indicateurs', title: 'STL Performance Indicators', publisher: 'STL Laval', sourceType: 'performance-dashboard', accessedAt: '2026-09-26', pagesOrSections: 'Ponctualité du service – Transport régulier' },
    ],
  },
  'comox-valley': {
    schedule: {
      definition: 'BC Transit defines on-time departures at timing points as no more than 1 minute early and no more than 3 minutes late.',
      notes: ['The reviewed source is a BC Transit service-design standard published for the Kamloops system; it is recorded as an operator-level reference, not a Comox Valley-specific performance target.'],
      sourceIds: ['bc-transit-service-design-standards'],
    },
    sources: [{ id: 'bc-transit-service-design-standards', url: 'https://www.bctransit.com/wp-content/uploads/142/723/2022-01-24-KAM-SDSPG-final0.pdf', title: 'Service Design Standards', publisher: 'BC Transit', sourceType: 'service-standard', accessedAt: '2026-09-26', pagesOrSections: '5.4 On-time Performance' }],
  },
  kelowna: {
    schedule: {
      definition: 'BC Transit defines on-time departures at timing points as no more than 1 minute early and no more than 3 minutes late.',
      notes: ['The reviewed source is a BC Transit service-design standard published for the Kamloops system; it is recorded as an operator-level reference, not a Kelowna-specific performance target.'],
      sourceIds: ['bc-transit-service-design-standards'],
    },
    sources: [{ id: 'bc-transit-service-design-standards', url: 'https://www.bctransit.com/wp-content/uploads/142/723/2022-01-24-KAM-SDSPG-final0.pdf', title: 'Service Design Standards', publisher: 'BC Transit', sourceType: 'service-standard', accessedAt: '2026-09-26', pagesOrSections: '5.4 On-time Performance' }],
  },
  metrobus: {
    schedule: {
      definition: 'Metrobus service standards require fixed-route services to depart timed or scheduled stops from 0 minutes early to 3 minutes late at least 85% of the time.',
      notes: ['The same source separately lists a customer pickup-window standard for dynamic on-demand service; that policy is excluded from this study.'],
      sourceIds: ['metrobus-transit-review'],
    },
    sources: [{ id: 'metrobus-transit-review', url: 'https://www.metrobus.com/pdf/StJohnsTransitReview2019.pdf', title: 'St. John’s Transit Review', publisher: 'City of St. John’s / Metrobus', sourceType: 'service-standard', accessedAt: '2026-09-26', pagesOrSections: 'Table 18: On-time Performance Standards' }],
  },
  upexpress: {
    schedule: {
      definition: 'Metrolinx measures UP Express on-time performance as arrival within 5 minutes of the targeted journey time.',
      notes: ['This is a journey-arrival measure rather than a departure-headway rule.'],
      sourceIds: ['metrolinx-business-plan-2025-26'],
    },
    sources: [{ id: 'metrolinx-business-plan-2025-26', url: 'https://assets.metrolinx.com/image/upload/v1764160191/Documents/2025-26_Business_Plan_English.pdf', title: '2025-26 Metrolinx Business Plan', publisher: 'Metrolinx', sourceType: 'business-plan', accessedAt: '2026-09-26', pagesOrSections: 'On-Time Performance' }],
  },
  jeffersontransit: {
    schedule: {
      definition: null,
      notes: ['The reviewed operational analysis reports route-level on-time percentages but does not define the minute window used to classify a trip as on time.'],
      sourceIds: ['jefferson-operational-analysis'],
    },
    headway: {
      definition: 'The operational analysis specifies a 30-minute peak-period headway and a consistent 30-minute headway for selected shuttle service, but does not define an allowed headway deviation or bunching threshold.',
      notes: ['This is a scheduled service-design interval, not an observed headway-reliability tolerance.'],
      sourceIds: ['jefferson-operational-analysis'],
    },
    sources: [{ id: 'jefferson-operational-analysis', url: 'https://www.jeffersontransit.com/DocumentCenter/View/893/Comprehensive-Operational-Analysis-PDF', title: '2025 Comprehensive Operational Analysis', publisher: 'Jefferson Transit', sourceType: 'operations-analysis', accessedAt: '2026-09-26', pagesOrSections: 'Service guidelines and on-time performance tables' }],
  },
  'owen-sound': {
    schedule: {
      definition: null,
      notes: ['The reviewed city notice discusses a 30-minute peak schedule and timing adjustments but does not define an acceptable early/late window or an on-time target.'],
      sourceIds: ['owen-sound-timing-pilot'],
    },
    sources: [{ id: 'owen-sound-timing-pilot', url: 'https://www.owensound.ca/news-and-public-notices/posts/city-to-pilot-minor-timing-changes-for-owen-sound-transit/', title: 'City to Pilot Minor Timing Changes for Owen Sound Transit', publisher: 'City of Owen Sound', sourceType: 'service-change-notice', accessedAt: '2026-09-26', pagesOrSections: 'On-time performance and 30-minute schedule' }],
  },
  cornwall: {
    schedule: {
      definition: null,
      notes: ['The transit master plan documents observed early and late running, including trips more than 10 minutes late, and recommends schedule refinement; it does not define an official tolerance or target.'],
      sourceIds: ['cornwall-transit-master-plan'],
    },
    sources: [{ id: 'cornwall-transit-master-plan', url: 'https://www.cornwall.ca/en/city-hall/resources/Master-Plans/10.25.17-Cornwall-TMP---Final-Report_Part1.pdf', title: 'Cornwall Transit Master Plan', publisher: 'City of Cornwall', sourceType: 'transit-master-plan', accessedAt: '2026-09-26', pagesOrSections: '9.1.1 Improve On-Time Performance/Adherence to Schedule' }],
  },
  lyon: {
    schedule: {
      definition: null,
      notes: ['TCL documents punctuality and line regularity as monitored quality indicators using onboard tools and recorded stop passages, but the reviewed customer charter does not state a numeric early/late tolerance.'],
      sourceIds: ['tcl-customer-charter'],
    },
    sources: [{ id: 'tcl-customer-charter', url: 'https://www.tcl.fr/sites/default/files/2019-07/CHARTE%2BCLIENTS%2BTCL.PDF', title: 'TCL Customer Charter', publisher: 'TCL / SYTRAL Mobilités', sourceType: 'customer-charter', accessedAt: '2026-09-26', pagesOrSections: 'Punctuality and regularity of lines' }],
  },
  augusta: {
    schedule: {
      definition: 'Augusta Transit considers a vehicle on time when it departs a scheduled time point no more than 1 minute early and no more than 5 minutes late, with an objective of at least 90%.',
      notes: [],
      sourceIds: ['augusta-title-vi-2024'],
    },
    headway: {
      definition: 'Augusta Transit publishes policy headways by route family and period, including 40-minute peak headways and 40- to 80-minute base or evening headways, but does not state an allowed deviation from those headways.',
      notes: ['This is a scheduled service standard, not a headway-regularity tolerance.'],
      sourceIds: ['augusta-title-vi-2024'],
    },
    sources: [{ id: 'augusta-title-vi-2024', url: 'https://www.augustaga.gov/DocumentCenter/View/19838/Augusta-Transit-Title-VI-Plan-May-2024-051024-ADOPTED', title: 'Augusta Transit Title VI Plan', publisher: 'Augusta-Richmond County', sourceType: 'title-vi-plan', accessedAt: '2026-09-26', pagesOrSections: 'Vehicle Headway; On-Time Performance' }],
  },
  hart: {
    schedule: {
      definition: 'HART’s published KPI defines on-time performance at timepoints as departures from 1 minute early through 5 minutes late.',
      notes: ['The source describes the metric but does not provide a systemwide percentage target in the reviewed page.'],
      sourceIds: ['hart-kpi-dashboard'],
    },
    sources: [{ id: 'hart-kpi-dashboard', url: 'https://www.gohart.org/Pages/AboutUS-KPI.aspx', title: 'HART Planning and Performance Indicators', publisher: 'Hillsborough Area Regional Transit', sourceType: 'performance-dashboard', accessedAt: '2026-09-26', pagesOrSections: 'On Time Performance at Timepoints' }],
  },
  miway: {
    schedule: {
      definition: 'MiWay’s 2024 asset-management plan defines a bus as on time when it is between 1 minute early and 5 minutes late. A later 2025 plan reports a methodology change to 2 minutes early and 4 minutes late, so both periods are recorded.',
      notes: ['The agency has changed its measurement window; the study does not collapse the two definitions into one current rule.'],
      sourceIds: ['miway-2024-asset-plan', 'miway-2025-asset-plan'],
    },
    sources: [
      { id: 'miway-2024-asset-plan', url: 'https://www.mississauga.ca/wp-content/uploads/2024/06/27113648/2024-corporate-asset-management-plan.pdf', title: '2024 Corporate Asset Management Plan', publisher: 'City of Mississauga', sourceType: 'asset-plan', accessedAt: '2026-09-26', pagesOrSections: 'Transit / On-Time Performance' },
      { id: 'miway-2025-asset-plan', url: 'https://www.mississauga.ca/wp-content/uploads/2025/06/03145826/2025-Corporate-Asset-Management-Plan.pdf', title: '2025 Corporate Asset Management Plan', publisher: 'City of Mississauga', sourceType: 'asset-plan', accessedAt: '2026-09-26', pagesOrSections: 'Transit’s Level of Service' },
    ],
  },
  piercetransit: {
    schedule: {
      definition: 'Pierce Transit’s current fixed-route definition considers a bus on time when it is up to 1 minute early and up to 5 minutes late; the agency strives for 90% on-time performance in its Stream program standards.',
      notes: ['Older Title VI materials use a 0-to-4-minute window; the study records the current and historical definitions separately.'],
      sourceIds: ['pierce-stream-standards', 'pierce-reliability-appendix'],
    },
    headway: {
      definition: 'Pierce Transit’s Stream program standards consider a bus late when the gap is more than 3 minutes longer than the intended headway.',
      notes: ['This is an explicit headway-management tolerance for higher-frequency service, distinct from schedule adherence.'],
      sourceIds: ['pierce-stream-standards'],
    },
    sources: [
      { id: 'pierce-stream-standards', url: 'https://piercetransit.org/wp-content/uploads/2025/01/Appendix-C-Program-Standards.pdf', title: 'Stream Program Standards', publisher: 'Pierce Transit', sourceType: 'service-standard', accessedAt: '2026-09-26', pagesOrSections: 'Reliability / On-Time Performance / Headway Management' },
      { id: 'pierce-reliability-appendix', url: 'https://piercetransit.org/wp-content/uploads/2024/12/Appendix-A-H-Version-2.pdf', title: 'Reliability Appendix', publisher: 'Pierce Transit', sourceType: 'reliability-standard', accessedAt: '2026-09-26', pagesOrSections: 'Fixed-route reliability' },
    ],
  },
  tcat: {
    schedule: {
      definition: 'TCAT defines on-time performance as 0 to 5 minutes late in the reviewed board performance report, with an average on-time target of 90%.',
      notes: ['The reviewed source does not state an early-departure allowance.'],
      sourceIds: ['tcat-board-minutes-2021'],
    },
    sources: [{ id: 'tcat-board-minutes-2021', url: 'https://tcatbus.com/wp-content/uploads/2021.06.24_Minutes-4.pdf', title: 'TCAT Board Minutes', publisher: 'Tompkins Consolidated Area Transit', sourceType: 'board-minutes', accessedAt: '2026-09-26', pagesOrSections: 'Systems Report / On-time Performance' }],
  },
  collier: {
    schedule: {
      definition: 'Collier Area Transit’s fixed-route service standard allows local, express, and trolley buses to be up to 5 minutes late, with a 95% on-time goal.',
      notes: ['The same table separately lists a paratransit standard; that service is excluded from this study.'],
      sourceIds: ['collier-service-standards'],
    },
    sources: [{ id: 'collier-service-standards', url: 'https://www.colliercountyfl.gov/home/showdocument?id=93262', title: 'System-Wide Service Standards', publisher: 'Collier Area Transit / Collier County', sourceType: 'service-standard', accessedAt: '2026-09-26', pagesOrSections: 'On-Time Performance' }],
  },
  avta: {
    schedule: {
      definition: 'AVTA’s operating specification treats a trip as late when it departs a designated timepoint at least 10 minutes late or at least half the scheduled headway late, whichever threshold is smaller; it also penalizes early departures and requires at least 85% on-time performance.',
      notes: ['The specification uses a headway-scaled lateness threshold rather than one fixed minute window.'],
      sourceIds: ['avta-master-rfp-2025'],
    },
    headway: {
      definition: 'AVTA defines a missed trip for service-quality enforcement as a scheduled trip not operated, and uses the smaller of half the route headway or 10 minutes as a late-trip threshold.',
      notes: ['This is an enforcement threshold, not a statement that every observed headway must remain within that amount.'],
      sourceIds: ['avta-master-rfp-2025'],
    },
    sources: [{ id: 'avta-master-rfp-2025', url: 'https://www.avta.com/downloads/AVTA_MASTER_RFP_2025-05-Formatted_Reviewed.pdf', title: 'AVTA Master RFP', publisher: 'Antelope Valley Transit Authority', sourceType: 'operating-specification', accessedAt: '2026-09-26', pagesOrSections: 'Schedule and Operations Related Liquidated Damages' }],
  },
  rtl: {
    schedule: {
      definition: 'RTL Longueuil requires at least 85% of trips to arrive on time at control points and 95% of trips to depart on time at terminals, with a tolerance of 1 minute early and 3 minutes late.',
      notes: ['The source separately describes a 30-minute reservation window for adapted transportation; that policy is excluded.'],
      sourceIds: ['rtl-quality-standards'],
    },
    sources: [{ id: 'rtl-quality-standards', url: 'https://www.rtl-longueuil.qc.ca/fr-CA/rtl/historique/', title: 'RTL Quality Standards', publisher: 'Réseau de transport de Longueuil', sourceType: 'quality-standard', accessedAt: '2026-09-26', pagesOrSections: 'Normes de qualité / Ponctualité du service' }],
  },
  colmar: {
    schedule: {
      definition: 'Trace Colmar defines punctuality and regularity as the bus passing between H−1 and H+3 minutes.',
      notes: [],
      sourceIds: ['trace-colmar-commitments'],
    },
    sources: [{ id: 'trace-colmar-commitments', url: 'https://www.trace-colmar.fr/nous-connaitre/notre-raison-detre/nos-engagements/', title: 'Trace Colmar Service Commitments', publisher: 'Trace Colmar / Colmar Agglomération', sourceType: 'service-standard', accessedAt: '2026-09-26', pagesOrSections: 'Démarche qualité / Ponctualité-régularité' }],
  },
  carta: {
    schedule: {
      definition: 'CARTA defines on-time performance as a vehicle completing a scheduled run from 1 minute early through 10 minutes late, with no early running accepted, and a 90% systemwide or route-level standard.',
      notes: [],
      sourceIds: ['carta-title-vi-2024'],
    },
    headway: {
      definition: 'CARTA publishes route-level service-frequency standards, such as 60- or 90-minute headways, but the reviewed policy does not define an allowed deviation or bunching threshold.',
      notes: ['This is a scheduled frequency standard, not a headway-reliability tolerance.'],
      sourceIds: ['carta-title-vi-2024'],
    },
    sources: [{ id: 'carta-title-vi-2024', url: 'https://ridecarta.com/wp-content/uploads/2024/06/CARTA-Agenda-Packet-6-12-2024.pdf', title: 'CARTA Agenda Packet', publisher: 'Charleston Area Regional Transportation Authority', sourceType: 'title-vi-service-monitoring', accessedAt: '2026-09-26', pagesOrSections: 'On-time performance and vehicle headway standards' }],
  },
  blacksburg: {
    schedule: {
      definition: null,
      notes: ['The reviewed official budget reports Blacksburg Transit on-time performance targets and results but does not state the minute window used to classify a trip as on time.'],
      sourceIds: ['blacksburg-budget-2026-27'],
    },
    sources: [{ id: 'blacksburg-budget-2026-27', url: 'https://www.blacksburg.gov/home/showpublisheddocument/14127/639089269708361176', title: 'FY 2026-27 Proposed Budget', publisher: 'Town of Blacksburg', sourceType: 'budget', accessedAt: '2026-09-26', pagesOrSections: 'Transit Department / On-Time Performance' }],
  },
  'ben-franklin': {
    schedule: {
      definition: 'Ben Franklin Transit’s fixed-route standard treats a bus as early when it departs more than 1 minute before schedule and late when it arrives more than 5 minutes after schedule; earlier planning documents describe a 1-minute-early to 5-minute-late, 90% informal target.',
      notes: ['The 2025 service-standard wording and earlier planning target are recorded separately. Demand-response windows are excluded.'],
      sourceIds: ['bft-service-standards-2025', 'bft-tdp-2021-26'],
    },
    sources: [
      { id: 'bft-service-standards-2025', url: 'https://www.bft.org/wp-content/uploads/2025/07/Board-Packet-2025-07-17-REVISED-1.pdf', title: 'Systemwide Service Standards', publisher: 'Ben Franklin Transit', sourceType: 'service-standard', accessedAt: '2026-09-26', pagesOrSections: 'Fixed Route On-Time Performance' },
      { id: 'bft-tdp-2021-26', url: 'https://www.bft.org/assets/1/6/2021-2026_bft_transit_development_plan.pdf', title: '2021-2026 Transit Development Plan', publisher: 'Ben Franklin Transit', sourceType: 'transit-development-plan', accessedAt: '2026-09-26', pagesOrSections: 'Local Performance Measures and Targets' },
    ],
  },
  westcat: {
    schedule: {
      definition: 'WestCAT considers Express and Local fixed-route vehicles on time when they depart a scheduled timepoint from 5 minutes early through 5 minutes late; Regional Transbay Commute service uses the same early window and allows up to 15 minutes late. Each has a 90% objective.',
      notes: [],
      sourceIds: ['westcat-title-vi-2025'],
    },
    headway: {
      definition: 'WestCAT publishes route-family headway standards by period, ranging from 20-minute peak Express or Regional service to 60-minute night or base service, but does not state an allowed deviation or bunching threshold.',
      notes: ['This is a scheduled frequency standard, not a headway-reliability tolerance.'],
      sourceIds: ['westcat-title-vi-2025'],
    },
    sources: [{ id: 'westcat-title-vi-2025', url: 'https://www.westcat.org/Content/pdf/WCCTA_Feb2025_Full_BODPacket.pdf', title: 'WestCAT Title VI Program', publisher: 'Western Contra Costa Transit Authority', sourceType: 'title-vi-program', accessedAt: '2026-09-26', pagesOrSections: 'Policy Headways and Periods of Operation; On-Time Performance Standards' }],
  },
  'port-huron': {
    schedule: {
      definition: 'Blue Water Area Transportation Commission considers a fixed-route vehicle on time when it departs a scheduled timepoint no more than 1 minute early and no more than 5 minutes late, with an on-time objective of at least 80%.',
      notes: [],
      sourceIds: ['bwatc-title-vi'],
    },
    sources: [{ id: 'bwatc-title-vi', url: 'https://bwbus.com/wp-content/uploads/BWATC-Title-VI-program-updated-3-24-15-002.pdf', title: 'BWATC Title VI Program', publisher: 'Blue Water Area Transportation Commission', sourceType: 'title-vi-program', accessedAt: '2026-09-26', pagesOrSections: 'On-time Performance Standards' }],
  },
  kitsaptransit: {
    schedule: {
      definition: 'Kitsap Transit’s fixed-route bus and ferry standard measures on-time performance as arrivals at a transit station within 5 minutes of the posted schedule, with a 95% minimum by time of day in the reviewed Title VI program.',
      notes: ['The agency’s on-demand pickup-window policy is excluded.'],
      sourceIds: ['kitsap-title-vi'],
    },
    sources: [{ id: 'kitsap-title-vi', url: 'https://www.kitsaptransit.com/uploads/pdf/projects/kitsaptransittitleviprogram.pdf', title: 'Kitsap Transit Title VI Program', publisher: 'Kitsap Transit', sourceType: 'title-vi-program', accessedAt: '2026-09-26', pagesOrSections: 'On-Time Performance Standard' }],
  },
  'citybus-lafayette': {
    schedule: {
      definition: 'CityBus of Greater Lafayette sets an 85% fixed-route on-time standard: arrivals must be no more than 5 minutes late and buses must not depart early.',
      notes: ['The reviewed service standard includes separate demand-response and FLEX services; those are excluded.'],
      sourceIds: ['citybus-service-standards'],
    },
    sources: [{ id: 'citybus-service-standards', url: 'https://www.in.gov/citybuslafayette/files/04.25-BrdPkt.pdf', title: 'CityBus Service Standards', publisher: 'Greater Lafayette Public Transportation Corporation', sourceType: 'service-standard', accessedAt: '2026-09-26', pagesOrSections: 'On-Time Performance & Reliability' }],
  },
  santarosa: {
    schedule: {
      definition: 'Santa Rosa CityBus defines on-time at scheduled timepoints as arriving within 5 minutes of the scheduled time and not leaving early, with a 90% minimum standard.',
      notes: [],
      sourceIds: ['santa-rosa-srttp'],
    },
    sources: [{ id: 'santa-rosa-srttp', url: 'https://srcitybus.org/wp-content/uploads/2023/11/FY-2016-25-SRTP-FINAL-161027.pdf', title: 'Short Range Transit Plan', publisher: 'City of Santa Rosa / Santa Rosa CityBus', sourceType: 'transit-plan', accessedAt: '2026-09-26', pagesOrSections: 'Route On-Time Performance' }],
  },
  'butler-county-rta': {
    schedule: {
      definition: 'Butler County Regional Transit Authority defines fixed-route motor-bus and commuter-bus on-time performance as 0–1 minutes early and 0–5 minutes late at designated timepoints, with an 85% minimum standard in the reviewed 2024 board packet.',
      notes: ['The source separately lists a demand-response window; that service is excluded.'],
      sourceIds: ['bcrta-board-packet-2024'],
    },
    sources: [{ id: 'bcrta-board-packet-2024', url: 'https://www.butlercountyrta.com/wp-content/uploads/2023/12/1-BCRTA-Board-Packet-3-20-2024-V-3-signed.pdf', title: 'BCRTA Board Packet', publisher: 'Butler County Regional Transit Authority', sourceType: 'board-packet', accessedAt: '2026-09-26', pagesOrSections: 'On-Time Performance' }],
  },
  'cats-baton': {
    schedule: {
      definition: 'Capital Area Transit System defines fixed-route on-time performance as departing no earlier than the printed schedule and arriving no later than 5 minutes after the scheduled time, with an 80% target.',
      notes: [],
      sourceIds: ['cats-title-vi-2021'],
    },
    headway: {
      definition: 'CATS describes typical fixed-route headways as 20–60 minutes and sets target headways of 30 minutes at peak and 60 minutes off-peak for local routes.',
      notes: ['The source states target headways but does not define an allowed deviation or bunching threshold.'],
      sourceIds: ['cats-title-vi-2021'],
    },
    sources: [{ id: 'cats-title-vi-2021', url: 'https://www.brcats.com/assets/docs/Communications/7_30_2021_CATS_Title_VI_Program_Final.pdf', title: 'CATS Title VI Program', publisher: 'Capital Area Transit System', sourceType: 'title-vi-program', accessedAt: '2026-09-26', pagesOrSections: 'Service Standards and Policies' }],
  },
  pvpta: {
    schedule: {
      definition: 'Palos Verdes Peninsula Transit Authority considers a vehicle on time when it departs a scheduled timepoint no more than 1 minute early and no more than 5 minutes late, with a 90% objective.',
      notes: [],
      sourceIds: ['pvpta-service-standards'],
    },
    headway: {
      definition: 'PVPTA publishes scheduled route frequencies of 15 and 30 minutes, with hourly service on Route 225–226, but does not define an allowed deviation or bunching threshold.',
      notes: ['This is a scheduled frequency standard, not a headway-reliability tolerance.'],
      sourceIds: ['pvpta-service-standards'],
    },
    sources: [{ id: 'pvpta-service-standards', url: 'https://palosverdes.com/pvtransit/10-17-2013-Agenda.pdf', title: 'PVPTA Service Standards and Policies', publisher: 'Palos Verdes Peninsula Transit Authority', sourceType: 'service-standard', accessedAt: '2026-09-26', pagesOrSections: 'Vehicle Headway; On-Time Performance' }],
  },
  clallamtransit: {
    schedule: {
      definition: 'Clallam Transit’s reviewed operations analysis classifies service trips as on time from 0 to 5 minutes, with early trips before 0 minutes and late trips after 5 minutes.',
      notes: ['The source reports observed performance separately and does not state a target percentage.'],
      sourceIds: ['clallam-coa'],
    },
    sources: [{ id: 'clallam-coa', url: 'https://irp.cdn-website.com/0eaf265e/files/uploaded/Clallam%20Transit%20COA%20Final%20Report%2008.10.2021%20PRINT%20READY.pdf', title: 'Clallam Transit Comprehensive Operations Analysis', publisher: 'Clallam Transit System', sourceType: 'operations-analysis', accessedAt: '2026-09-26', pagesOrSections: 'Service Performance / On-Time Performance' }],
  },
  everetttransit: {
    schedule: {
      definition: 'Everett Transit defines fixed-route on-time service as departing no earlier than the scheduled time and no later than 5 minutes after it.',
      notes: ['The source separately discusses paratransit; that service is excluded from the Atlas comparison.'],
      sourceIds: ['everett-title-vi-2023'],
    },
    headway: {
      definition: 'Everett Transit publishes maximum fixed-route headways of 30 minutes in peak periods and 60 minutes at midday, evening, and weekends. Its schedule-adherence targets are 85% for peak service at 10–30-minute headways and 95% for other listed periods/headway bands.',
      notes: ['These are service-frequency and adherence targets, not a minute-level headway-deviation tolerance.'],
      sourceIds: ['everett-title-vi-2023'],
    },
    sources: [{ id: 'everett-title-vi-2023', url: 'https://everetttransit.org/DocumentCenter/View/2408/Title-VI-Plan-2023-2026-PDF?bidId=', title: 'Everett Transit Title VI Plan 2023–2026', publisher: 'Everett Transit', sourceType: 'title-vi-plan', accessedAt: '2026-09-26', pagesOrSections: 'Vehicle Headway; On-time Performance' }],
  },
  'st-thomas': {
    schedule: {
      definition: null,
      status: 'not_found',
      notes: ['The reviewed official transportation plan discusses measuring schedule adherence and on-time performance but does not publish a minute-level fixed-route lateness window. The rider guide also distinguishes regular conventional service from on-demand and parallel service.'],
      sourceIds: ['st-thomas-tmp', 'st-thomas-ride-guide'],
    },
    sources: [
      { id: 'st-thomas-tmp', url: 'https://www.stthomas.ca/UserFiles/Servers/Server_12189721/File/City%20Hall/Environmental%20Services/TMP/StThomas_TMP_20211126.pdf', title: 'St. Thomas Transportation Master Plan', publisher: 'City of St. Thomas', sourceType: 'transportation-master-plan', accessedAt: '2026-09-26', pagesOrSections: 'Transit priority / schedule adherence' },
      { id: 'st-thomas-ride-guide', url: 'https://www.stthomas.ca/UserFiles/Servers/Server_12189721/File/Living%20Here/Transportation/Ride%20Guide%20One%20Page.pdf', title: 'Railway City Transit Ride Guide', publisher: 'City of St. Thomas', sourceType: 'rider-guide', accessedAt: '2026-09-26', pagesOrSections: 'Schedules and service types' },
    ],
  },
  'moose-jaw': {
    schedule: {
      definition: null,
      status: 'not_found',
      notes: ['The official fixed-route page publishes scheduled service hours and routes, but no minute-level lateness or schedule-adherence tolerance. The separate paratransit pickup rule is excluded.'],
      sourceIds: ['moose-jaw-fixed-route'],
    },
    headway: {
      definition: 'Moose Jaw says its four fixed routes converge downtown every 40 minutes, but does not state an allowed headway deviation or bunching threshold.',
      status: 'definition_found',
      notes: ['This is a published scheduled frequency, not a reliability tolerance.'],
      sourceIds: ['moose-jaw-faq', 'moose-jaw-fixed-route'],
    },
    sources: [
      { id: 'moose-jaw-fixed-route', url: 'https://moosejaw.ca/transit/fixed-route-service/', title: 'Moose Jaw Fixed Route Service', publisher: 'City of Moose Jaw', sourceType: 'fixed-route-service-page', accessedAt: '2026-09-26', pagesOrSections: 'Regular Fixed Route Service' },
      { id: 'moose-jaw-faq', url: 'https://moosejaw.ca/faqs/', title: 'City of Moose Jaw FAQ', publisher: 'City of Moose Jaw', sourceType: 'service-information', accessedAt: '2026-09-26', pagesOrSections: 'Transit transfers and schedules' },
    ],
  },
  brest: {
    schedule: {
      definition: null,
      status: 'not_found',
      notes: ['Bibus commits to monitoring regularity and punctuality for scheduled transit, but the reviewed public quality page does not state a minute-level on-time window. The reservation-based ACCEMO punctuality rule is excluded.'],
      sourceIds: ['bibus-quality'],
    },
    sources: [{ id: 'bibus-quality', url: 'https://www.bibus.fr/bibus-et-vous/qui-sommes-nous/notre-demarche-qualite', title: 'Bibus Quality Approach', publisher: 'Bibus / Brest métropole', sourceType: 'quality-policy', accessedAt: '2026-09-26', pagesOrSections: 'Qualité de service' }],
  },
  marseille: {
    schedule: {
      definition: null,
      status: 'not_found',
      notes: ['RTM publicly describes monitoring regularity and punctuality and reports schedule-respect objectives, but the reviewed official material does not state a minute-level fixed-route lateness window.'],
      sourceIds: ['rtm-quality-certification', 'rtm-annual-report-2023'],
    },
    sources: [
      { id: 'rtm-quality-certification', url: 'https://www.rtm.fr/espace-presse/la-satisfaction-des-voyageurs-au-coeur-de-la-strategie-de-la-rtm-880-000-voyagesjour', title: 'RTM Service Quality Certification', publisher: 'Régie des Transports Métropolitains', sourceType: 'quality-policy', accessedAt: '2026-09-26', pagesOrSections: 'Regularity and punctuality' },
      { id: 'rtm-annual-report-2023', url: 'https://www.rtm.fr/sites/default/files/docs/RTM_RA2023_compressed_1.pdf', title: 'RTM Annual Report 2023', publisher: 'Régie des Transports Métropolitains', sourceType: 'annual-report', accessedAt: '2026-09-26', pagesOrSections: 'Bus quality contract' },
    ],
  },
  tours: {
    schedule: {
      definition: null,
      status: 'not_found',
      notes: ['Fil Bleu publishes scheduled frequencies and operates a real-time information service, but the reviewed official network page does not state a numeric fixed-route lateness window. The separate demand-responsive policy is excluded.'],
      sourceIds: ['filbleu-network'],
    },
    sources: [{ id: 'filbleu-network', url: 'https://www.filbleu.fr/services/le-reseau-bus-tram', title: 'Fil Bleu Network', publisher: 'Fil Bleu / Tours Métropole', sourceType: 'network-information', accessedAt: '2026-09-26', pagesOrSections: 'Bus and tram network' }],
  },
  mulhouse: {
    schedule: {
      definition: null,
      status: 'not_found',
      notes: ['Soléa tracks punctuality and publishes network-level targets, including 95% for major tram lines and 81% for buses in the reviewed service-delegation material, but does not state a minute-level late/early window.'],
      sourceIds: ['solea-dsp-quality', 'solea-quality-commitments'],
    },
    sources: [
      { id: 'solea-dsp-quality', url: 'https://www.solea.info/sites/default/files/2025-02/CP%20m2A%20-%20Transdev%20-%20Sol%C3%A9a%20-%20Signature%20DSP%20des%20mobilt%C3%A9s.pdf', title: 'Soléa Mobility Service Delegation Commitments', publisher: 'Soléa / m2A', sourceType: 'service-delegation', accessedAt: '2026-09-26', pagesOrSections: 'Quality performance commitments' },
      { id: 'solea-quality-commitments', url: 'https://www.solea.info/engagements-qualite', title: 'Soléa Quality Commitments', publisher: 'Soléa', sourceType: 'quality-policy', accessedAt: '2026-09-26', pagesOrSections: 'Punctuality and service quality' },
    ],
  },
  pau: {
    schedule: {
      definition: null,
      status: 'not_found',
      notes: ['Idelis explains that bus delays can occur and that its control centre regulates service minute by minute, but the reviewed official material does not define a numeric fixed-route lateness window. Reservation and demand-responsive punctuality rules are excluded.'],
      sourceIds: ['idelis-faq', 'idelis-satisfaction-2023'],
    },
    sources: [
      { id: 'idelis-faq', url: 'https://www.idelis.fr/contact/faq', title: 'Idelis FAQ', publisher: 'Idelis / Pau Béarn Pyrénées Mobilités', sourceType: 'customer-information', accessedAt: '2026-09-26', pagesOrSections: 'Why is my bus late?' },
      { id: 'idelis-satisfaction-2023', url: 'https://www.idelis.fr/fileadmin/Fichiers_client/ENQUETES/Satisfaction_2023.pdf', title: 'Idelis Customer Satisfaction Survey 2023', publisher: 'Idelis', sourceType: 'customer-survey', accessedAt: '2026-09-26', pagesOrSections: 'Punctuality and frequency' },
    ],
  },
  'durango-transit': {
    schedule: {
      definition: 'Durango Transit considers a fixed-route vehicle on time when it departs a scheduled timepoint no more than 5 minutes late.',
      notes: ['The reviewed standard does not state an early-departure allowance. It separately describes paratransit and microtransit service, which are excluded.'],
      sourceIds: ['durango-title-vi-2025'],
    },
    headway: {
      definition: 'Durango publishes fixed-route frequencies of 30 minutes for loop buses and 20 minutes for the trolley during peak, base, and evening periods, but does not define an allowed headway deviation or bunching threshold.',
      notes: ['This is a scheduled frequency standard, not a headway-reliability tolerance.'],
      sourceIds: ['durango-title-vi-2025'],
    },
    sources: [{ id: 'durango-title-vi-2025', url: 'https://www.durangoco.gov/DocumentCenter/View/36319/Title-VI-Report-PDF---2025-Update', title: 'Durango Transit Title VI Report 2025 Update', publisher: 'City of Durango', sourceType: 'title-vi-report', accessedAt: '2026-09-26', pagesOrSections: 'On-Time Performance Standards; Service Frequency' }],
  },
  juneau: {
    schedule: {
      definition: null,
      status: 'not_found',
      notes: ['The reviewed official Capital Transit site and planning material describe fixed-route service and reliability goals but do not state a minute-level lateness window. Capital AKcess paratransit is excluded.'],
      sourceIds: ['capital-transit-site', 'juneau-coa'],
    },
    sources: [
      { id: 'capital-transit-site', url: 'https://juneaucapitaltransit.org/about-us/', title: 'About Capital Transit', publisher: 'City and Borough of Juneau', sourceType: 'agency-information', accessedAt: '2026-09-26', pagesOrSections: 'Fixed-route and paratransit services' },
      { id: 'juneau-coa', url: 'https://juneaucapitaltransit.org/wp-content/uploads/2016/04/Juneau-COA-FINAL.pdf', title: 'Capital Transit Comprehensive Operations Analysis', publisher: 'City and Borough of Juneau', sourceType: 'operations-analysis', accessedAt: '2026-09-26', pagesOrSections: 'Fixed Route Scorecards' },
    ],
  },
  'chemung-county': {
    schedule: {
      definition: null,
      status: 'not_found',
      notes: ['The reviewed official C-TRAN planning and board material reports service-performance metrics but does not state a minute-level fixed-route lateness window.'],
      sourceIds: ['ctran-long-range-plan', 'ctran-board'],
    },
    sources: [
      { id: 'ctran-long-range-plan', url: 'https://www.chemungcountyny.gov/DocumentCenter/View/19019/ECTC-LRTP---Adopted-9-30-25_reduced?bidId=', title: 'Elmira-Chemung Long Range Transportation Plan', publisher: 'Elmira-Chemung Transportation Council', sourceType: 'long-range-plan', accessedAt: '2026-09-26', pagesOrSections: 'C-TRAN Performance Metrics' },
      { id: 'ctran-board', url: 'https://chemungcountyny.gov/744/Transit-Board', title: 'Chemung County Transit Board', publisher: 'Chemung County', sourceType: 'agency-governance', accessedAt: '2026-09-26', pagesOrSections: 'Transit oversight and policy' },
    ],
  },
  kalamazoo: {
    schedule: {
      definition: null,
      status: 'not_found',
      notes: ['The reviewed Kalamazoo Metro operations analysis discusses on-time performance and frequency as service attributes but does not state a minute-level fixed-route lateness window. The Metro Connect on-demand service is excluded.'],
      sourceIds: ['kalamazoo-coa'],
    },
    sources: [{ id: 'kalamazoo-coa', url: 'https://www.kmetro.com/wp-content/uploads/board_presentation_-_february_2022-1.pdf', title: 'Kalamazoo Metro Comprehensive Operations Analysis', publisher: 'Kalamazoo County Transportation Authority', sourceType: 'operations-analysis', accessedAt: '2026-09-26', pagesOrSections: 'Stakeholder Questions / On-time Performance and Frequency' }],
  },
  'indian-river': {
    schedule: {
      definition: null,
      status: 'not_found',
      notes: ['GoLine is a fixed-route system, while Community Coach is demand-response. The reviewed official material gives fixed-route operating hours and frequencies but no minute-level schedule-adherence window; the demand-response rules are excluded.'],
      sourceIds: ['goline-2025-tdp', 'goline-site'],
    },
    headway: {
      definition: 'GoLine’s official material describes one-hour headways for the fixed-route network and half-hour timed connections for selected routes, but does not define an allowed headway deviation or bunching threshold.',
      notes: ['This is a published service pattern, not a headway-reliability tolerance.'],
      sourceIds: ['goline-2025-tdp', 'goline-riding'],
    },
    sources: [
      { id: 'goline-2025-tdp', url: 'https://www.indianriver.gov/Agenda%20%26%20Minutes/Transportation%20Disadvantaged%20Local%20Coordinating%20Board/2025/TDLCB022425A.pdf?t=202502211636580', title: 'Indian River County 2025 Transit Development Plan Annual Update', publisher: 'Indian River County MPO', sourceType: 'transit-development-plan', accessedAt: '2026-09-26', pagesOrSections: 'Current Transit Service / Fixed-Route Service' },
      { id: 'goline-site', url: 'https://golineirt.com/', title: 'GoLine', publisher: 'Indian River County / Senior Resource Association', sourceType: 'agency-information', accessedAt: '2026-09-26', pagesOrSections: 'Fixed-route service' },
      { id: 'goline-riding', url: 'https://golineirt.com/info.html', title: 'Riding GoLine', publisher: 'GoLine', sourceType: 'rider-information', accessedAt: '2026-09-26', pagesOrSections: 'Timed connections' },
    ],
  },
  'la-rochelle': {
    schedule: {
      definition: null,
      status: 'not_found',
      notes: ['Yélo describes improving frequency and quality and separately documents its reservation-based on-demand service, but the reviewed official material does not state a minute-level fixed-route lateness window.'],
      sourceIds: ['yelo-faq'],
    },
    sources: [{ id: 'yelo-faq', url: 'https://www.yelo-larochelle.fr/faq/', title: 'Yélo FAQ', publisher: 'Yélo / La Rochelle Agglomération', sourceType: 'customer-information', accessedAt: '2026-09-26', pagesOrSections: 'Network evolution and service quality' }],
  },
  toulon: {
    schedule: {
      definition: null,
      status: 'not_found',
      notes: ['Réseau Mistral describes regulation and service-quality work for regular lines but the reviewed official material does not state a minute-level fixed-route lateness window. Reservation-based Appel Bus and PMR policies are excluded.'],
      sourceIds: ['mistral-exploitation', 'mistral-trip-preparation'],
    },
    sources: [
      { id: 'mistral-exploitation', url: 'https://www.reseaumistral.com/mistral-vous/rejoignez-nous', title: 'Réseau Mistral Operations', publisher: 'Réseau Mistral / RD TPM', sourceType: 'agency-information', accessedAt: '2026-09-26', pagesOrSections: 'Exploitation and regulation' },
      { id: 'mistral-trip-preparation', url: 'https://www.reseaumistral.com/je-prepare-mon-deplacement', title: 'Preparing a Journey on Réseau Mistral', publisher: 'Réseau Mistral', sourceType: 'customer-information', accessedAt: '2026-09-26', pagesOrSections: 'Regular lines and reserved services' },
    ],
  },
  grenoble: {
    schedule: {
      definition: null,
      status: 'not_found',
      notes: ['The reviewed official TAG activity material discusses quality indicators and service performance but does not state a minute-level fixed-route lateness window. Reservation-based Flexo service rules are excluded.'],
      sourceIds: ['tag-activity-2019'],
    },
    sources: [{ id: 'tag-activity-2019', url: 'https://semitag.tag.fr/cms_viewFile.php?idtf=2763&path=Rapport-Activite-2019.pdf', title: 'SEMITAG Activity Report 2019', publisher: 'SEMITAG / TAG', sourceType: 'annual-report', accessedAt: '2026-09-26', pagesOrSections: 'Quality indicators and service' }],
  },
  bordeaux: {
    schedule: {
      definition: null,
      status: 'not_found',
      notes: ['TBM publishes scheduled frequencies and describes regularity as a service objective, but the reviewed official network material does not state a minute-level fixed-route lateness window. Mobibus reservation rules are excluded.'],
      sourceIds: ['tbm-bus-network'],
    },
    sources: [{ id: 'tbm-bus-network', url: 'https://www.infotbm.com/fr/lignes_de_bus', title: 'TBM Bus Network', publisher: 'TBM / Bordeaux Métropole', sourceType: 'network-information', accessedAt: '2026-09-26', pagesOrSections: 'Bus express, frequency, and regularity' }],
  },
  burlington: {
    schedule: {
      definition: null,
      status: 'not_found',
      notes: ['Burlington publishes fixed-route schedules and real-time information, but the reviewed official transit pages do not state a minute-level fixed-route lateness window. Specialized transit rules are excluded.'],
      sourceIds: ['burlington-schedules', 'burlington-transit'],
    },
    sources: [
      { id: 'burlington-schedules', url: 'https://www.burlington.ca/en/transit/schedules-and-routes.aspx', title: 'Burlington Transit Schedules and Routes', publisher: 'City of Burlington', sourceType: 'schedule-page', accessedAt: '2026-09-26', pagesOrSections: 'Routes and schedules' },
      { id: 'burlington-transit', url: 'https://www.burlington.ca/en/transit/transit.aspx', title: 'Burlington Transit', publisher: 'City of Burlington', sourceType: 'agency-information', accessedAt: '2026-09-26', pagesOrSections: 'Fixed-route and specialized transit' },
    ],
  },
  bloomington: {
    schedule: {
      definition: 'Bloomington Transit considers a fixed-route vehicle on time when it arrives at a timepoint no more than 5 minutes after schedule and departs no earlier than schedule; earlier departures and arrivals over 5 minutes late are classified separately.',
      notes: ['The source also describes route-level review and possible headway or schedule adjustments. BloomingtonLink microtransit is excluded.'],
      sourceIds: ['bloomington-title-vi-2022'],
    },
    headway: {
      definition: null,
      status: 'not_found',
      notes: ['The reviewed source mentions headway adjustments as a remedial action but does not define a headway deviation or bunching tolerance.'],
      sourceIds: ['bloomington-title-vi-2022'],
    },
    sources: [{ id: 'bloomington-title-vi-2022', url: 'https://bloomingtontransit.com/wp-content/uploads/2024/03/Title-VI-and-LEP-Program-2022-2025.pdf', title: 'Bloomington Transit Title VI and LEP Program', publisher: 'Bloomington Public Transportation Corporation', sourceType: 'title-vi-program', accessedAt: '2026-09-26', pagesOrSections: 'On-Time Performance' }],
  },
  beeline: {
    schedule: {
      definition: null,
      status: 'not_found',
      notes: ['The reviewed official performance material reports Bee-Line fixed-route operating statistics but does not state a minute-level schedule-adherence window.'],
      sourceIds: ['beeline-performance'],
    },
    sources: [{ id: 'beeline-performance', url: 'https://www.dot.ny.gov/divisions/policy-and-strategy/public-trans-rpository/8_Westchester.pdf', title: 'Westchester County Bee-Line Operating and Performance Statistics', publisher: 'New York State Department of Transportation', sourceType: 'performance-report', accessedAt: '2026-09-26', pagesOrSections: 'Fixed Route and Paratransit' }],
  },
  'bowling-green': {
    schedule: {
      definition: 'GO bg Transit defines on-time performance as completing established runs no more than 0 minutes early or 5 minutes late, with a 95% target.',
      notes: ['The source is for GO bg Transit in Bowling Green, Kentucky. It is separate from the demand-response BG Transit service in Bowling Green, Ohio.'],
      sourceIds: ['go-bg-title-vi'],
    },
    sources: [{ id: 'go-bg-title-vi', url: 'https://www.bgky.org/files/crBmcFcg.pdf', title: 'GO bg Transit On-Time Performance Standard', publisher: 'City of Bowling Green, Kentucky', sourceType: 'title-vi-program', accessedAt: '2026-09-26', pagesOrSections: 'On-time performance for each mode' }],
  },
  'santaclarita': {
    schedule: {
      definition: 'Santa Clarita Transit defines on-time as departing a stop no more than 5 minutes after and not before the posted time; departures 6 or more minutes late are late.',
      notes: ['The source reports local and commuter fixed-route performance separately. Dial-A-Ride and other demand-responsive services are excluded.'],
      sourceIds: ['santa-clarita-tdp'],
    },
    sources: [{ id: 'santa-clarita-tdp', url: 'https://filecenter.santa-clarita.com/transit/SCT%202018-TDP-Final%20Report_May%202019_Final.pdf', title: 'Santa Clarita Transit Development Plan', publisher: 'City of Santa Clarita', sourceType: 'transit-development-plan', accessedAt: '2026-09-26', pagesOrSections: 'Schedule Adherence' }],
  },
  'laguna-beach': {
    schedule: {
      definition: null,
      status: 'not_found',
      notes: ['Laguna Beach publishes fixed-route trolley frequencies and separately identifies Laguna Local as on-demand, but the reviewed official transit page does not state a minute-level fixed-route lateness window.'],
      sourceIds: ['laguna-trolleys'],
    },
    headway: {
      definition: 'Laguna Beach publishes fixed-route trolley frequencies of every 20–30 minutes on the Coastal Route and every 30 minutes on the Canyon Route, but does not define an allowed deviation or bunching threshold.',
      notes: ['This is a published frequency, not a headway-reliability tolerance.'],
      sourceIds: ['laguna-trolleys'],
    },
    sources: [{ id: 'laguna-trolleys', url: 'https://www.lagunabeachcity.net/live-here/parking-and-transportation/trolleys', title: 'Laguna Beach Trolleys', publisher: 'City of Laguna Beach', sourceType: 'fixed-route-service-page', accessedAt: '2026-09-26', pagesOrSections: 'Coastal and Canyon Route frequencies' }],
  },
  vctc: {
    schedule: {
      definition: 'VCTC Intercity defines on-time performance as no more than 8 minutes late and no early arrivals, with an 85% target; Valley Express fixed route uses no more than 15 minutes late and no early arrivals, with a 95% target.',
      notes: ['VCTC’s source separately describes Valley Express demand-response service; this study records only the fixed-route standards.'],
      sourceIds: ['vctc-title-vi-2019'],
    },
    headway: {
      definition: 'VCTC publishes fixed-route headway standards: 60 minutes peak and 90 minutes off-peak for intra-county Intercity routes; Valley Express uses 60 minutes peak and 120 minutes off-peak where offered. It does not define an allowed headway deviation or bunching threshold.',
      notes: ['These are scheduled service standards, not headway-reliability tolerances.'],
      sourceIds: ['vctc-title-vi-2019'],
    },
    sources: [{ id: 'vctc-title-vi-2019', url: 'https://www.goventura.org/wp-content/uploads/2019/09/Item-8L-Attachment-VCTC-Title-VI-Report-AMENDED-FINAL.pdf', title: 'VCTC Title VI Program', publisher: 'Ventura County Transportation Commission', sourceType: 'title-vi-program', accessedAt: '2026-09-26', pagesOrSections: 'Headway and on-time performance policies' }],
  },
  'bustang-outrider': {
    schedule: {
      definition: null,
      status: 'not_found',
      notes: ['The reviewed official Bustang/Outrider pages publish routes, schedules, and delay alerts but do not state a numeric fixed-route lateness window or headway reliability tolerance.'],
      sourceIds: ['bustang-home', 'bustang-alerts'],
    },
    sources: [
      { id: 'bustang-home', url: 'https://ridebustang.com/', title: 'Bustang and Outrider', publisher: 'Colorado Department of Transportation', sourceType: 'agency-information', accessedAt: '2026-09-26', pagesOrSections: 'Routes and service types' },
      { id: 'bustang-alerts', url: 'https://ridebustang.com/alerts/', title: 'Bustang Alerts', publisher: 'Colorado Department of Transportation', sourceType: 'service-alerts', accessedAt: '2026-09-26', pagesOrSections: 'Route delays and schedule changes' },
    ],
  },
  'grand-junction': {
    schedule: {
      definition: null,
      status: 'not_found',
      notes: ['Grand Valley Transit’s strategic plan discusses schedule reliability and acknowledges that its on-time data was not accurate, but does not state a numeric lateness window or service-spacing tolerance.'],
      sourceIds: ['gvt-strategic-plan'],
    },
    sources: [{ id: 'gvt-strategic-plan', url: 'https://gvt.mesacounty.us/globalassets/strategic-plan/grand-valley-transit-strategic-plan.pdf', title: 'Grand Valley Transit Strategic Plan', publisher: 'Mesa County / Grand Valley Transit', sourceType: 'strategic-plan', accessedAt: '2026-09-26', pagesOrSections: 'Transit System Scorecard / Schedule Reliability' }],
  },
  camarillo: {
    schedule: {
      definition: null,
      status: 'not_found',
      notes: ['The reviewed official Ventura County transit plan reports a 15-minute pickup window for Camarillo Dial-a-Ride, which is demand-responsive and excluded. No fixed-route schedule-lateness rule was found for Camarillo Area Transit in the reviewed source.'],
      sourceIds: ['camarillo-short-range-plan'],
    },
    sources: [{ id: 'camarillo-short-range-plan', url: 'https://www.goventura.org/wp-content/uploads/2026/03/2026.04.03_Attachment-Item-9K_Final-FY2025-2034-Short-Range-Transit-Plan.pdf', title: 'Ventura Countywide Short Range Transit Plan', publisher: 'Ventura County Transportation Commission', sourceType: 'short-range-transit-plan', accessedAt: '2026-09-26', pagesOrSections: 'Camarillo Dial-a-Ride On-Time Performance' }],
  },
  poitiers: {
    schedule: {
      definition: null,
      status: 'not_found',
      notes: ['Vitalis publishes regular fixed-route schedules and separately describes Flex’e-bus reservation service, but the reviewed official pages do not state a minute-level fixed-route lateness window.'],
      sourceIds: ['vitalis-regular-lines', 'vitalis-flexibus'],
    },
    sources: [
      { id: 'vitalis-regular-lines', url: 'https://www.vitalis-poitiers.fr/services/lignes-regulieres/', title: 'Vitalis Regular Lines', publisher: 'Vitalis / Grand Poitiers', sourceType: 'fixed-route-service-page', accessedAt: '2026-09-26', pagesOrSections: 'Regular lines and service periods' },
      { id: 'vitalis-flexibus', url: 'https://www.vitalis-poitiers.fr/services/transport-a-la-demande/', title: 'Vitalis Flex’e-bus', publisher: 'Vitalis / Grand Poitiers', sourceType: 'on-demand-service-page', accessedAt: '2026-09-26', pagesOrSections: 'Reservation service' },
    ],
  },
  caen: {
    schedule: {
      definition: null,
      status: 'not_found',
      notes: ['Twisto publishes regular bus and tram schedules and identifies Flex services separately, but the reviewed official fixed-route pages do not state a minute-level lateness window. The reservation-window rule for Twisto Flex is excluded.'],
      sourceIds: ['twisto-bus', 'twisto-schedules', 'twisto-flex-faq'],
    },
    sources: [
      { id: 'twisto-bus', url: 'https://www.twisto.fr/bus', title: 'Twisto Bus Network', publisher: 'Twisto / Caen la mer', sourceType: 'fixed-route-service-page', accessedAt: '2026-09-26', pagesOrSections: 'Bus network and frequencies' },
      { id: 'twisto-schedules', url: 'https://www.twisto.fr/se-deplacer/horaires/depliants-horaires', title: 'Twisto Timetables', publisher: 'Twisto / Caen la mer', sourceType: 'schedule-page', accessedAt: '2026-09-26', pagesOrSections: 'Regular bus and tram schedules' },
      { id: 'twisto-flex-faq', url: 'https://www.twisto.fr/contact/faq', title: 'Twisto FAQ', publisher: 'Twisto / Caen la mer', sourceType: 'customer-information', accessedAt: '2026-09-26', pagesOrSections: 'Twisto Flex reservation' },
    ],
  },
  'saint-hyacinthe': {
    schedule: {
      definition: null,
      status: 'not_found',
      notes: ['The City of Saint-Hyacinthe publishes local fixed-route bus schedules and real-time vehicle location, but the reviewed official material does not state a minute-level lateness window.'],
      sourceIds: ['saint-hyacinthe-schedule', 'saint-hyacinthe-zenbus'],
    },
    sources: [
      { id: 'saint-hyacinthe-schedule', url: 'https://www.st-hyacinthe.ca/services-aux-citoyens/transport-collectif/horaire-dautobus', title: 'Saint-Hyacinthe Bus Schedule', publisher: 'City of Saint-Hyacinthe', sourceType: 'schedule-page', accessedAt: '2026-09-26', pagesOrSections: 'Local bus schedules' },
      { id: 'saint-hyacinthe-zenbus', url: 'https://www.st-hyacinthe.ca/communiques/2024-11-12/zenbus', title: 'Saint-Hyacinthe Zenbus', publisher: 'City of Saint-Hyacinthe', sourceType: 'real-time-information', accessedAt: '2026-09-26', pagesOrSections: 'Real-time bus location and schedules' },
    ],
  },
  charleville: {
    schedule: {
      definition: null,
      status: 'not_found',
      notes: ['Bustac publishes fixed-route schedules for the TAC network serving Charleville-Mézières, but the reviewed official route material does not state a minute-level lateness or headway-reliability window.'],
      sourceIds: ['bustac-line-1'],
    },
    sources: [{ id: 'bustac-line-1', url: 'https://www.bustac.fr/se-deplacer/horaires/ligne-bus-1', title: 'Bustac Route 1 Timetable', publisher: 'Bustac / Ardenne Métropole', sourceType: 'schedule-page', accessedAt: '2026-09-26', pagesOrSections: 'TAC mobility guide and route schedule' }],
  },
  laon: {
    schedule: {
      definition: null,
      status: 'not_found',
      notes: ['TUL Laon publishes fixed-route schedules and separately identifies transport à la demande service, but the reviewed official timetable page does not state a minute-level fixed-route lateness window.'],
      sourceIds: ['tul-laon-schedules'],
    },
    sources: [{ id: 'tul-laon-schedules', url: 'https://www.tul-laon.fr/mes-lignes/horaires-des-lignes', title: 'TUL Laon Timetables', publisher: 'TUL Laon', sourceType: 'schedule-page', accessedAt: '2026-09-26', pagesOrSections: 'Line schedules and service types' }],
  },
  saumur: {
    schedule: {
      definition: null,
      status: 'not_found',
      notes: ['Saumur Agglobus publishes urban fixed-route schedules and service days, but the reviewed official timetable page does not state a minute-level lateness or headway-reliability window.'],
      sourceIds: ['saumur-agglobus-schedules'],
    },
    sources: [{ id: 'saumur-agglobus-schedules', url: 'https://www.agglobus.fr/index.php?Itemid=245&layout=category&option=com_zoo&view=category', title: 'Saumur Agglobus Urban Timetables', publisher: 'Saumur Agglobus', sourceType: 'schedule-page', accessedAt: '2026-09-26', pagesOrSections: 'Urban network timetable sheets' }],
  },
  menton: {
    schedule: {
      definition: null,
      status: 'not_found',
      notes: ['Zest publishes regular-route schedules and identifies Zestgo as a separate on-demand service, but the reviewed official network material does not state a minute-level fixed-route lateness window.'],
      sourceIds: ['zest-network', 'zestgo'],
    },
    sources: [
      { id: 'zest-network', url: 'https://www.riviera-francaise.fr/reseau-zest/', title: 'Zest Network', publisher: 'Communauté d’agglomération de la Riviera Française', sourceType: 'network-information', accessedAt: '2026-09-26', pagesOrSections: 'Regular network and service changes' },
      { id: 'zestgo', url: 'https://www.zestbus.fr/zestgo', title: 'Zestgo On-Demand Service', publisher: 'Zestbus', sourceType: 'on-demand-service-page', accessedAt: '2026-09-26', pagesOrSections: 'On-demand service' },
    ],
  },
  vesoul: {
    schedule: {
      definition: null,
      status: 'not_found',
      notes: ['Moova publishes regular lines and separately identifies its personalized on-demand service, but the reviewed official network page does not state a minute-level fixed-route lateness window.'],
      sourceIds: ['moova-vesoul'],
    },
    sources: [{ id: 'moova-vesoul', url: 'https://www.vesoul.fr/au-quotidien/vbus-transports-en-commun.html', title: 'Moova Public Transport Network', publisher: 'Agglomération et Ville de Vesoul', sourceType: 'network-information', accessedAt: '2026-09-26', pagesOrSections: 'Regular lines and on-demand service' }],
  },
  compiegne: {
    schedule: {
      definition: null,
      status: 'not_found',
      notes: ['The official Compiègne transport information page documents TIC departures, schedules, and real-time information but does not state a minute-level fixed-route lateness window.'],
      sourceIds: ['oise-mobilite-compiegne'],
    },
    sources: [{ id: 'oise-mobilite-compiegne', url: 'https://www.agglo-compiegne.fr/oise-mobilite', title: 'Oise Mobilité and TIC Information', publisher: 'Agglomération de la Région de Compiègne', sourceType: 'network-information', accessedAt: '2026-09-26', pagesOrSections: 'TIC departures and passenger information' }],
  },
  laval: {
    schedule: {
      definition: null,
      status: 'not_found',
      notes: ['Laval Agglomération measures TUL punctuality and publishes a 95% conformity target, but the reviewed official delegation report does not state the minute-level definition behind that measure. TULIB and other demand-responsive rules are excluded.'],
      sourceIds: ['tul-delegation-report-2024', 'tul-network'],
    },
    sources: [
      { id: 'tul-delegation-report-2024', url: 'https://www.agglo-laval.fr/fileadmin/Phototheque_agglo/Transport/Bus/RD_LAVAL_Rapport_Annuel_2024.pdf', title: 'RD Laval Delegate Report 2024', publisher: 'Laval Agglomération', sourceType: 'delegation-report', accessedAt: '2026-09-26', pagesOrSections: 'Punctuality of service' },
      { id: 'tul-network', url: 'https://www.agglo-laval.fr/utile-au-quotidien/transports-et-mobilites/tul', title: 'TUL Network', publisher: 'Laval Agglomération', sourceType: 'network-information', accessedAt: '2026-09-26', pagesOrSections: 'Regular lines and TULIB' },
    ],
  },
  longbeach: {
    schedule: {
      definition: 'Long Beach Transit measures on-time performance as buses departing between 1 minute before and 5 minutes after scheduled time, with a goal above 85%.',
      notes: [],
      sourceIds: ['long-beach-budget-2026'],
    },
    sources: [{ id: 'long-beach-budget-2026', url: 'https://ridelbt.com/wp-content/uploads/2026/04/05-15-25-Board-Packet-1.pdf', title: 'Fiscal Year 2026 Budget', publisher: 'Long Beach Transit', sourceType: 'budget', accessedAt: '2026-09-26', pagesOrSections: 'Transit Service / On-Time Performance' }],
  },
  sunline: {
    schedule: {
      definition: 'SunLine defines on-time as a trip departing a timepoint from 0 minutes early to 3 minutes late, with a 90% target for all services. Other SunLine reports use a 0-to-5-minute window with an 85% minimum target, so the source set records both versions.',
      notes: ['The agency has changed or reported different standards across documents; this is not normalized into one rule.'],
      sourceIds: ['sunline-service-quality', 'sunline-otp-report'],
    },
    sources: [
      { id: 'sunline-service-quality', url: 'https://www.sunline.org/images/Agendas/Strategic_Planning-Operational_Committee_May_27_2020-web.pdf', title: 'Service Quality Standards', publisher: 'SunLine Transit Agency', sourceType: 'service-standard', accessedAt: '2026-09-26', pagesOrSections: 'On-time Performance' },
      { id: 'sunline-otp-report', url: 'https://www.sunline.org/images/BoD_Finance_Audit_Committee_Agenda_23_Apr_2018_0.pdf', title: 'On-Time Performance Percent by Line', publisher: 'SunLine Transit Agency', sourceType: 'performance-report', accessedAt: '2026-09-26', pagesOrSections: 'On Time' },
    ],
  },
  barrie: {
    schedule: {
      definition: 'Barrie reports fixed-route on-time performance as trips between 3 minutes early and 5 minutes late from schedule; its asset plan lists a fixed-route performance value and a separate on-demand value.',
      notes: ['The fixed-route and on-demand metrics are explicitly separate.'],
      sourceIds: ['barrie-asset-plan'],
    },
    sources: [{ id: 'barrie-asset-plan', url: 'https://www.barrie.ca/Corporate-Asset-Management-Plan.pdf', title: 'Corporate Asset Management Plan', publisher: 'City of Barrie', sourceType: 'asset-plan', accessedAt: '2026-09-26', pagesOrSections: 'Quality & Reliability' }],
  },
  guelph: {
    schedule: {
      definition: 'Guelph’s reported on-time criterion in transit advisory materials is 2 minutes early to 5 minutes late.',
      notes: ['The source is a transit advisory committee performance report, not a current formal service standard.'],
      sourceIds: ['guelph-tac'],
    },
    sources: [{ id: 'guelph-tac', url: 'https://guelph.ca/wp-content/uploads/TAC_Minutes_051619.pdf', title: 'Transit Advisory Committee Minutes', publisher: 'City of Guelph', sourceType: 'committee-minutes', accessedAt: '2026-09-26', pagesOrSections: 'On-time performance (April 2019)' }],
  },
  'red-deer': {
    schedule: {
      definition: null,
      notes: ['Red Deer publishes an 85% on-time target but the reviewed report does not state the minute window used to classify a bus as on time.'],
      sourceIds: ['red-deer-report-card'],
    },
    sources: [{ id: 'red-deer-report-card', url: 'https://www.reddeer.ca/media/reddeerca/city-government/mayor-and-city-council/strategic-plan/Q4-2023-Report-Card.pdf', title: 'Q4 2023 Report Card', publisher: 'City of Red Deer', sourceType: 'performance-report', accessedAt: '2026-09-26', pagesOrSections: 'Committed to Positive Customer Experience' }],
  },
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
  const catalog = JSON.parse(readFileSync(resolve(ROOT, 'docs/research/frequent-service-research-2026-09/frequent-service-catalog.json'), 'utf8')) as { agencies: CatalogRecord[] };
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
      serviceScope: 'static_scheduled',
      excludedPolicyScopes: ['on-demand', 'paratransit', 'reservation-window', 'customer pickup window'],
      schedulePunctuality: verified
        ? { status: verified.schedule.status ?? (verified.schedule.definition ? 'definition_found' : 'not_found'), definition: verified.schedule.definition, sourceIds: verified.schedule.sourceIds, notes: verified.schedule.notes }
        : { status: 'not_reviewed', definition: null, sourceIds: [], notes: [] },
      headwayReliability: verified?.headway
        ? { status: verified.headway.status ?? (verified.headway.definition ? 'definition_found' : 'not_found'), definition: verified.headway.definition, sourceIds: verified.headway.sourceIds, notes: verified.headway.notes }
        : verified
          ? { status: 'not_found', definition: null, sourceIds: verified.schedule.sourceIds, notes: ['The reviewed official source set did not state a headway or service-spacing reliability rule.'] }
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
    '- Scope: fixed-route scheduled service only; on-demand, paratransit, and reservation-window policies are excluded from the Atlas comparison',
    `- Status: ${records.every(record => record.schedulePunctuality.status !== 'not_reviewed' && record.headwayReliability.status !== 'not_reviewed') ? 'source review complete' : 'source review in progress'}; ${records.filter(record => record.sources.length > 0).length} of 80 agencies have verified official source sets`,
    '',
    '## Method', '',
    'This exploratory study records how agencies themselves define lateness, on-time performance, acceptable headway, bunching, and service reliability for fixed-route scheduled service. On-demand, paratransit, and reservation-window policies may be noted as separate context but do not influence the Atlas frequency comparison. The study does not change Atlas production logic.',
    '',
    'Each agency must end with either an official definition, an explicit no-definition-found result, or an inaccessible-source result. Sources must include a URL, title, publisher, access date, and page or section when applicable.',
    '',
    '## Atlas baseline', '',
    'The current pipeline baseline is a minimum 5-minute grace, a 15% grace component, up to 2 grace violations, and a 30% violation allowance. This study evaluates that baseline; it does not alter it.',
    '',
    '## Comparison with Atlas', '',
    'Atlas evaluates the gaps between consecutive scheduled departures, not whether an individual vehicle arrived within an agency’s on-time window. For a candidate tier T, Atlas allows a gap up to T + max(5 minutes, round(15% of T)); all larger gaps fail the tier, except that up to max(2, floor(30% of the observed gaps)) may be within that grace band. It also requires at least ceil(span minutes / T) trips.',
    'The reviewed agencies show that these are different concepts: schedule-adherence rules commonly use one-sided or asymmetric minute windows, while explicit headway rules are rarer and may scale with the intended headway. Pierce Transit, for example, uses a fixed-route on-time window plus a separate headway rule; AVTA uses the smaller of half-headway or 10 minutes for a late-trip enforcement threshold. These findings are evidence for keeping schedule punctuality and service-spacing reliability as separate research dimensions; they are not yet a basis for changing Atlas thresholds.',
    '',
    '## Findings summary', '',
    `- ${records.filter(record => record.schedulePunctuality.status === 'definition_found').length} of 80 agencies publish a numeric or otherwise explicit fixed-route schedule-punctuality definition; ${records.filter(record => record.schedulePunctuality.status === 'not_found').length} have an official source set but no numeric window was found.`,
    `- ${records.filter(record => record.headwayReliability.status === 'definition_found').length} of 80 agencies publish a headway or service-spacing rule; ${records.filter(record => record.headwayReliability.status === 'not_found').length} do not publish a headway-deviation or bunching tolerance in the reviewed source set.`,
    '- These counts describe published policy definitions, not measured performance. A published frequency or headway is not treated as an allowed reliability deviation.',
    '- On-demand and paratransit windows were retained only as exclusion notes where they appeared in the same source; they do not contribute to either count or to the Atlas comparison.',
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
    '| Agency | Country | Region | Size | Mode | Scope | Selection stratum | Schedule policy | Headway policy |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...records.map(record => `| ${record.name} | ${record.country} | ${record.region ?? '—'} | ${record.sizeBand} | ${record.modeFamily} | ${record.serviceScope} | ${record.selectionStratum} | ${record.schedulePunctuality.status} | ${record.headwayReliability.status} |`),
    '',
    '## Research ledger', '',
    `The structured ledger is [agency-lateness-policy-study-2026-09.json](agency-lateness-policy-study-2026-09.json). ${records.some(record => record.schedulePunctuality.status === 'not_reviewed' || record.headwayReliability.status === 'not_reviewed') ? 'The remaining official-source review must replace each `not_reviewed` status with `definition_found`, `not_found`, or `inaccessible` and add source-backed notes.' : 'Every record has a source-backed `definition_found` or `not_found` result for both schedule punctuality and headway reliability.'}`,
  ];
  writeFileSync(MARKDOWN_OUTPUT, `${lines.join('\n')}\n`);
  console.log(`Wrote ${JSON_OUTPUT}`);
  console.log(`Wrote ${MARKDOWN_OUTPUT}`);
}

main();
