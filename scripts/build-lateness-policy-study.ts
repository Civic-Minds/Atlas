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
  serviceScope: 'static_scheduled';
  excludedPolicyScopes: string[];
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
      serviceScope: 'static_scheduled',
      excludedPolicyScopes: ['on-demand', 'paratransit', 'reservation-window', 'customer pickup window'],
      schedulePunctuality: verified
        ? { status: verified.schedule.definition ? 'definition_found' : 'not_found', definition: verified.schedule.definition, sourceIds: verified.schedule.sourceIds, notes: verified.schedule.notes }
        : { status: 'not_reviewed', definition: null, sourceIds: [], notes: [] },
      headwayReliability: verified?.headway
        ? { status: 'definition_found', definition: verified.headway.definition, sourceIds: verified.headway.sourceIds, notes: verified.headway.notes }
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
    `- Status: sample initialized; ${records.filter(record => record.sources.length > 0).length} of 80 agencies have verified official source sets`,
    '',
    '## Method', '',
    'This exploratory study records how agencies themselves define lateness, on-time performance, acceptable headway, bunching, and service reliability for fixed-route scheduled service. On-demand, paratransit, and reservation-window policies may be noted as separate context but do not influence the Atlas frequency comparison. The study does not change Atlas production logic.',
    '',
    'Each agency must end with either an official definition, an explicit no-definition-found result, or an inaccessible-source result. Sources must include a URL, title, publisher, access date, and page or section when applicable.',
    '',
    '## Atlas baseline', '',
    'The current pipeline baseline is a minimum 5-minute grace, a 15% grace component, up to 2 grace violations, and a 30% violation allowance. This study evaluates that baseline; it does not alter it.',
    '',
    '## Interim comparison with Atlas', '',
    'Atlas evaluates the gaps between consecutive scheduled departures, not whether an individual vehicle arrived within an agency’s on-time window. For a candidate tier T, Atlas allows a gap up to T + max(5 minutes, round(15% of T)); all larger gaps fail the tier, except that up to max(2, floor(30% of the observed gaps)) may be within that grace band. It also requires at least ceil(span minutes / T) trips.',
    'The reviewed agencies show that these are different concepts: schedule-adherence rules commonly use one-sided or asymmetric minute windows, while explicit headway rules are rarer and may scale with the intended headway. Pierce Transit, for example, uses a fixed-route on-time window plus a separate headway rule; AVTA uses the smaller of half-headway or 10 minutes for a late-trip enforcement threshold. These findings are evidence for keeping schedule punctuality and service-spacing reliability as separate research dimensions; they are not yet a basis for changing Atlas thresholds.',
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
    'The structured ledger is [agency-lateness-policy-study-2026-09.json](agency-lateness-policy-study-2026-09.json). The official-source review must replace each `not_reviewed` status with `definition_found`, `not_found`, or `inaccessible` and add source-backed notes.',
  ];
  writeFileSync(MARKDOWN_OUTPUT, `${lines.join('\n')}\n`);
  console.log(`Wrote ${JSON_OUTPUT}`);
  console.log(`Wrote ${MARKDOWN_OUTPUT}`);
}

main();
