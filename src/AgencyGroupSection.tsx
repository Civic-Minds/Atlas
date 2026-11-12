import { fitAgencyName } from './utils/agencyName';
import { AREA_TABLE_OTHER, areaAgencyRowHref, areaTableColumnTitle, type AgencyGroupData, type AreaAgencyRow } from '../shared/areaPages';
import { AGENCY_INDEX_PATH } from '../shared/agencyIndex';
import { LINK } from './pageStyles';
import { FrequencyBar } from './pageParts';
import ArrowLink from './components/ui/ArrowLink';
import DataTable, { PAGE_FIGURE_COLUMN_REM } from './components/ui/DataTable';
import PageSection, { PageTable } from './components/ui/PageSection';

/**
 * Desktop widths of the agency table: the names' smallest width, and each mode column's. Seven mode columns fit beside the
 * names from 768px wide up, every header on at most two lines (CIV-973); narrower, the table scrolls.
 */
const AREA_NAME_COLUMN_REM = 10.75;
const AREA_MODE_COLUMN_REM = PAGE_FIGURE_COLUMN_REM;
/**
 * This surface's own width, past the one rule (AGENCY_NAME_MAX_CHARS) because its layout allows two lines:
 * with the "Other" column the names column is at its narrowest, so a full name past this length would wrap to three lines
 * or more on a phone ("San Francisco Bay Area Water Emergency Transportation Authority (WETA)"); it shows the short display
 * name instead, with the full name on hover. Names this long or shorter fit on two lines at 390px and from 900px up (CIV-973).
 */
const NARROW_NAME_MAX_CHARS = 55;

/**
 * A mode header with a slash breaks after it ("Subway/" over "Metro"); the rest wrap at spaces.
 * A column that counts more than its own mode says what it counts on hover (CIV-973: "Bus and trolleybus routes").
 */
function modeHeader(label: string) {
  const slash = label.indexOf('/');
  const text = slash > 0 ? <>{label.slice(0, slash + 1)}<br />{label.slice(slash + 1)}</> : label;
  const title = areaTableColumnTitle(label);
  return title ? <span title={title}>{text}</span> : text;
}

/** The agency's link in the table: its card title, or in a narrow names column a short one with the title on hover (#1245). */
function agencyNameLink(a: AreaAgencyRow, narrow: boolean) {
  const { text, title } = narrow ? fitAgencyName(a.title, a.displayName, NARROW_NAME_MAX_CHARS) : { text: a.title, title: undefined };
  return <a className={LINK} href={areaAgencyRowHref(a)} title={title}>{text}</a>;
}

/**
 * The agencies section of an area page, and of a state or province page (CIV-976): the frequency bar, its note and the
 * agency table by mode.
 */
export default function AgencyGroupSection({ data, barNote }: { data: AgencyGroupData; barNote: string }) {
  // CIV-1297: the page's one map link is at its top; "See all agencies" follows the table, as on agency pages.
  return (
    <PageSection id="agencies-heading" title="Agencies and weekday frequency">
      <p className="mt-3 text-base font-bold">Weekday midday frequency, by route</p>
      <FrequencyBar counts={data.bands} />
      <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{barNote}</p>
      <AgencyModeTable data={data} />
      <ArrowLink href={AGENCY_INDEX_PATH} className="mt-6">See all agencies</ArrowLink>
    </PageSection>
  );
}

/** The agency table by mode: an area's or state's agencies, or a parent agency's services (CIV-1277). */
export function AgencyModeTable({ data }: { data: Pick<AgencyGroupData, 'agencies' | 'modeColumns'> }) {
  return (
      <PageTable linkedRows>
          <DataTable
            caption="Agencies and route counts by mode"
            layout="page"
            rowHref={areaAgencyRowHref}
            rows={data.agencies}
            rowKey={a => a.slug}
            columns={[
              // Every area has the same mode columns (CIV-973); from md up they are narrow enough for eight to fit beside the names.
              { key: 'agency', header: 'Agency', rowHeader: true, width: AREA_NAME_COLUMN_REM, className: 'font-normal', cell: a => agencyNameLink(a, data.modeColumns.includes(AREA_TABLE_OTHER)) },
              ...data.modeColumns.map(m => ({ key: m, header: modeHeader(m), width: AREA_MODE_COLUMN_REM, cell: (a: (typeof data.agencies)[number]) => a.modes[m] ?? '–' })),
            ]}
          />
      </PageTable>
  );
}
