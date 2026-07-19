# Agency Backlog

Prioritized work queue for expanding Atlas static coverage. Machine-generated candidates land in `tmp/gap-candidates.json` via `npm run discover-gaps`; triage rows here.

Permanent blockers (no GTFS, dead feeds, on-demand only) belong in [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md) § Missing Agencies — not this file.

**Priority axis:** population-weighted — largest uncovered metros first.

---

## Status key

| Status | Meaning |
|--------|---------|
| `done` | Added to `index.json` and processed to R2 |
| `stub` | In index but was missing feed (fixed) |
| `todo` | Researched, ready to `npm run process` |
| `blocked` | No usable GTFS — moved to KNOWN_ISSUES |

---

## Recently completed (2026-07-16 — continent specialty batch)

| Status | Slug | Agency | Region | Notes |
|--------|------|--------|--------|-------|
| todo | `jfk-airtrain` | JFK AirTrain | New York | mdb-522 — config only |
| todo | `staten-island-ferry` | Staten Island Ferry | New York | mdb-518 — config only |
| todo | `nyc-ferry` | NYC Ferry | New York | mdb-515 — config only |
| todo | `rioc-tram` | Roosevelt Island Tramway | New York | mdb-1109 — config only |
| todo | `guadalajara` | Mi Transporte (Guadalajara) | Jalisco | mdb-2366 first MX — config only |
| todo | `cheyenne` | Cheyenne Transit Program | Wyoming | National RTAP CTP_gtfs — first WY — config only |
| todo | `rapid-city` | Rapid Transit System | South Dakota | National RTAP rts_corc_gtfs — config only |
| todo | `sioux-city` | Sioux City Transit System | Iowa | mdb-191 — config only |
| blocked | `cdmx` | CDMX multi-operator GTFS | Mexico City | Official datos.cdmx download timed out / MDB latest 403 |
| todo | `casper` | Casper Area Transit | Wyoming | ntd-80013 inactive but has zip — not added yet |

## Recently completed (2026-07-16 — Seattle specialty)

| Status | Slug | Agency | Region | Notes |
|--------|------|--------|--------|-------|
| todo | `seattle-streetcar` | Seattle Streetcar | Washington | KCM multi-agency zip (`agency_id` 23); must filter on process |
| todo | `seattle-monorail` | Seattle Center Monorail | Washington | Trillium seattlemonorail-wa-us — config only |
| todo | `snoqualmie-valley` | Snoqualmie Valley Transportation | Washington | Trillium snoqualmie-wa-us — config only |

## Recently completed (2026-07-16 — SoCal secondary batch)

| Status | Slug | Agency | Region | Notes |
|--------|------|--------|--------|-------|
| done | `imperial-valley` | Imperial Valley Transit | California | tld-5547 Imperial County |
| done | `kern-transit` | Kern Transit | California | mdb-47 county rural (not GET) |
| done | `banning` | Banning Connect | California | mdb-220 Pass area |
| done | `beaumont-ca` | Beaumont Transit | California | Trillium beaumont-ca-us |
| done | `corona` | Corona Cruiser | California | Trillium corona-ca-us |
| done | `thousand-oaks` | Thousand Oaks Transit | California | Trillium thousandoaks-ca-us — config only |
| done | `simi-valley` | Simi Valley Transit | California | Trillium simivalley-ca-us — config only |
| done | `camarillo` | Camarillo Area Transit | California | Trillium camarillo-ca-us — config only |
| done | `basin-transit` | Basin Transit | California | Trillium morongobasin-ca-us — config only |
| done | `needles` | Needles Area Transit | California | Trillium needles-ca-us — config only |
| done | `arvin` | Arvin Transit | California | Trillium arvin-ca-us — config only |
| done | `moorpark` | Moorpark City Transit | California | Trillium moorparkcitytransit-ca-us — config only |
| done | `valley-express` | Valley Express | California | Trillium valleyexpress-ca-us — config only |
| done | `laguna-beach` | Laguna Beach Transit | California | Trillium lagunabeach-ca-us — config only |
| done | `taft` | Taft Area Transit | California | Trillium taft-ca-us — config only (Ojai/Palo Verde lacked public zip) |
| blocked | `anaheim-art` | Anaheim Resort Transportation | California | MDB feed has empty calendar — unusable until upstream fixed |

## Recently completed (2026-07-14 — secondary cities batch)

| Status | Slug | Agency | Region | Notes |
|--------|------|--------|--------|-------|
| done | `sioux-falls` | Sioux Area Metro (SAM) | South Dakota | mdb-192 first SD agency |
| done | `wilmington-nc` | Wave Transit (Wilmington) | North Carolina | mdb-1110 (MDB mirror; agency URL 404) |
| done | `yakima` | Yakima Transit | Washington | mdb-276 |
| done | `grand-forks` | Cities Area Transit (Grand Forks) | North Dakota | mdb-2199 |
| done | `st-george` | SunTran (St. George) | Utah | mdb-111 (MDB mirror; fivecounty 404) |
| done | `grand-junction` | Grand Valley Transit | Colorado | mdb-161 |
| done | `greeley` | Greeley-Evans Transit (GET) | Colorado | mdb-2076 |
| done | `bridgeport-gbt` | Greater Bridgeport Transit | Connecticut | mdb-530 |
| done | `davenport` | Davenport CitiBus | Iowa | mdb-2304 Quad Cities |
| done | `bettendorf` | Bettendorf Transit | Iowa | mdb-1826 Quad Cities |
| done | `dubuque` | The Jule (Dubuque) | Iowa | mdb-2083 |
| done | `pocatello` | Pocatello Regional Transit | Idaho | mdb-171 |
| done | `albany-ga` | Albany Transit System | Georgia | mdb-2146 |

## Recently completed (2026-07-14 — university / campus batch)

| Status | Slug | Agency | Region | Notes |
|--------|------|--------|--------|-------|
| done | `um-transit` | University of Michigan Transit Services | Michigan | mdb-2072 free open public |
| done | `ncsu-wolfline` | NCSU Wolfline | North Carolina | mdb-2245 free open public |
| done | `clemson-cat` | Clemson Area Transit (CATbus) | South Carolina | mdb-798 stale calendar ~2020 |
| done | `citybus-lafayette` | CityBus of Greater Lafayette | Indiana | mdb-391 Purdue metro |
| done | `duke` | Duke University Transit | North Carolina | mdb-378 calendar expired 2025-08 |
| done | `streamline` | Streamline (Bozeman) | Montana | mdb-295 Montana State |
| done | `athens-oh` | Athens Public Transit | Ohio | mdb-1973 stale calendar ~2024 |
| done | `connect-transit` | Connect Transit (Bloomington-Normal) | Illinois | mdb-2267 ISU twin cities |
| done | `dekalb` | DeKalb Public Transit | Illinois | mdb-308 NIU area |
| done | `radford` | Radford Transit | Virginia | mdb-2415 |

## Recently completed (2026-07-09)

| Status | Slug | Agency | Region | Notes |
|--------|------|--------|--------|-------|
| done | `yellowknife` | Yellowknife Transit | Northwest Territories | tld-4708 |
| done | `whitehorse` | Whitehorse Transit | Yukon | mdb-689 |
| done | `ben-franklin` | Ben Franklin Transit | Washington | mdb-2122 Tri-Cities |
| done | `asheville` | Asheville Rides Transit | North Carolina | mdb-903 |
| done | `bloomington` | Bloomington Transit | Indiana | mdb-2066 college town |
| done | `athens-acc` | Athens Clarke County Transit | Georgia | tld-4777 |
| done | `uga` | UGA Campus Transit | Georgia | tld-2276 |
| done | `blacksburg` | Blacksburg Transit | Virginia | mdb-1189 |
| done | `cata-state-college` | CATA (State College) | Pennsylvania | ntd-30054 |
| done | `cyride` | CyRide (Ames) | Iowa | mdb-923 |
| done | `iowa-city` | Iowa City Transit | Iowa | mdb-559 |
| done | `coralville` | Coralville Transit | Iowa | mdb-196 |
| done | `cambus` | CAMBUS (University of Iowa) | Iowa | mdb-197 |
| done | `lawrence-ku` | Lawrence Transit / KU on Wheels | Kansas | mdb-2063 |
| done | `springfield-il` | SMTD (Springfield IL) | Illinois | mdb-3187 |
| done | `topeka` | Topeka Metro | Kansas | tld-1660_1 |
| done | `barta` | BARTA (Reading) | Pennsylvania | mdb-2064 |
| done | `coast-nh` | COAST (Seacoast NH) | New Hampshire | tld-4668 |
| done | `advance-transit` | Advance Transit | New Hampshire | mdb-631 Upper Valley |
| done | `ccta` | CCTA / Green Mountain Transit | Vermont | mdb-629 Burlington area |
| done | `marble-valley` | Marble Valley Transit (Rutland) | Vermont | mdb-430 |
| done | `bis-man` | Bis-Man Transit | North Dakota | tld-6095 Bismarck |
| done | `bangor` | Bangor Community Connector | Maine | tld-7824 |
| done | `brandon` | Brandon Transit | Manitoba | tld-4820 |
| done | `juneau` | Capital Transit (Juneau) | Alaska | mdb-294 |
| done | `annapolis` | Annapolis Transit | Maryland | mdb-2285 |

## Previously completed (2026-07-08)

| Status | Slug | Agency | Region | Notes |
|--------|------|--------|--------|-------|
| done | `springfield-mo` | City Utilities Transit | Missouri | Official `webapp.cityutilities.net/GTPM` |
| done | `brownsville` | Brownsville Metro | Texas | tld-7927 (was stub; processed) |
| done | `evansville` | METS (Evansville) | Indiana | ntd-50043 (stale calendar end ~2025-01) |
| done | `kenosha` | Kenosha Area Transit | Wisconsin | Trillium feed (stale ~2024; NTD waived) |

## Blocked from Tier 1–2 (no public fixed-route GTFS)

| Status | Slug | Agency | Region | Notes |
|--------|------|--------|--------|-------|
| blocked | `peterborough` | Peterborough Transit | Ontario | No public URL; tmix 404; not in MDB |
| blocked | `brantford` | Brantford Transit | Ontario | No public URL; tmix 404; not in MDB |
| blocked | `cape-breton` | Transit Cape Breton | Nova Scotia | No public GTFS found |
| blocked | `sts-saguenay` | STS Saguenay | Quebec | Données Québec points at STS Sherbrooke host; no Saguenay zip |
| blocked | `sttr` | STTR Trois-Rivières | Quebec | Feed dead — see KNOWN_ISSUES |

---

## Previously completed (2026-07-06)

| Status | Slug | Agency | Region | Notes |
|--------|------|--------|--------|-------|
| done | `sarnia` | Sarnia Transit | Ontario | tld-4738 |
| done | `port-huron` | Blue Water Area Transit | Michigan | tld-7035 |
| done | `tarta` | TARTA (Toledo) | Ohio | tld-1716_1 |
| done | `madison-metro` | Madison Metro Transit | Wisconsin | mdb-394 |
| done | `sjrtd` | San Joaquin RTD (Stockton) | California | mdb-886 — was already in index, reprocessed |
| done | `modesto` | Modesto Area Express | California | mdb-2273 (StaRT) |
| done | `cats-baton` | Capital Area Transit System | Louisiana | mdb-2065 |
| done | `knoxville` | Knoxville Area Transit | Tennessee | mdb-1121 |
| done | `mcallen` | Metro McAllen | Texas | ntd-60099 |
| done | `youngstown-wrta` | WRTA Youngstown | Ohio | Renamed from duplicate `wrta` slug |
| done | `augusta` | Augusta Transit | Georgia | tld-5780 |
| done | `lincoln` | StarTran (Lincoln NE) | Nebraska | mdb-2269 |
| done | `south-bend` | South Bend Transpo | Indiana | tld-7019 |
| done | `rockford` | Rockford Mass Transit District | Illinois | mdb-2019 |
| done | `racine` | Ryde Racine | Wisconsin | mdb-2246 |
| done | `sudbury` | Greater Sudbury Transit | Ontario | mdb-737 |
| done | `anchorage` | Anchorage People Mover | Alaska | mdb-225 |
| done | `lexington` | Lextran | Kentucky | mdb-2067 |
| done | `mtd-champaign` | Champaign-Urbana MTD | Illinois | ntd-50060 |
| done | `kalamazoo` | Kalamazoo Metro Transit | Michigan | tld-674 |
| done | `laredo` | El Metro (Laredo) | Texas | tld-7038 — feed may be stale |
| done | `thunder-bay` | Thunder Bay Transit | Ontario | mdb-736 |
| done | `greensboro` | Greensboro Transit Authority | North Carolina | mdb-615 |
| done | `winston-salem` | WSTA | North Carolina | ridewsta.com |
| done | `lanta` | LANTA (Allentown) | Pennsylvania | ntd-30010 |
| done | `cat-harrisburg` | Capital Area Transit | Pennsylvania | tld-4298 |
| done | `jackson-ms` | JTRAN | Mississippi | mdb-2652 |
| done | `lancaster` | Red Rose Transit | Pennsylvania | mdb-2000 |
| done | `colts` | COLTS (Scranton) | Pennsylvania | tld-4553 |
| done | `lcta` | LCTA (Wilkes-Barre) | Pennsylvania | tld-4555 |
| done | `patco` | PATCO Speedline | New Jersey | mdb-3035 |

---

## Tier 1 — US (complete)

All population-weighted Tier 1 todos processed or blocked (none remaining).

---

## Tier 2 — Canada (complete for available feeds)

Actionable Tier 2 todos exhausted. Remaining items are **blocked** (see above + KNOWN_ISSUES).

---

## Tier 3 — State / corridor completion

| Status | Slug | Agency | Region | Notes |
|--------|------|--------|--------|-------|
| done | `ccta` | CCTA / Green Mountain Transit | Vermont | mdb-629 (GMT brand / Chittenden) |
| done | `marble-valley` | Marble Valley Transit | Vermont | mdb-430 |
| done | `coast-nh` | COAST (Seacoast NH) | New Hampshire | tld-4668 |
| done | `advance-transit` | Advance Transit | New Hampshire | mdb-631 |
| blocked | `manchester-nh` | Manchester Transit Authority | New Hampshire | MDB inactive only — see KNOWN_ISSUES |

---

## France expansion — 2026-07-19 speedrun (dry-run candidates, still hidden)

~142 French cities dry-run validated and added as `hiddenInProduction` / `pmtilesPending` across two batches — major metros (Lyon, Marseille, Toulouse, Nice, Cannes, Limoges, …) plus mid-size networks in every métropole région. Wrong-geo matches and stops-only feeds rejected (not added). No live R2 publish — country launch still required.

## France expansion — blocked (no shapes)

Permanent until upstream ships `shapes.txt` on the real network feed. Details in [`KNOWN_ISSUES.md`](./KNOWN_ISSUES.md) § Missing Agencies and [`INTERNATIONAL.md`](./INTERNATIONAL.md) § France.

| Status | Slug | Agency | Region | Notes |
|--------|------|--------|--------|-------|
| blocked | `montpellier` | TaM (Montpellier) | Occitanie | Full + urbain GTFS have no shapes; suburbain-only has shapes but misses tram/urban |
| blocked | `lille` | ilévia (Lille) | Hauts-de-France | Export never includes `shapes.txt` |
| blocked | `strasbourg` | CTS (Strasbourg) | Grand Est | Export never includes `shapes.txt` |
| blocked | `thionville` | TeMo'b (Thionville) | Grand Est | Dry-run produced stops only (no route LineStrings) |

---

## Tier 4 — Secondary metros (HANDOFF / discover-gaps)

Run `npm run discover-gaps -- --min-pop 100000` for fresh ranked list. Notables from prior sessions:

- Bakersfield, Stockton, Modesto — **Stockton/Modesto done**; Bakersfield already covered as `get`
- Tacoma — covered via `piercetransit`
- Reno — covered via `rtcwashoe`
- Secondary CA: Bakersfield (`get` done), Tulare (`tulare-county-transit` done), Visalia done
- TX secondaries beyond McAllen/Laredo

---

## Workflow

Triage steps specific to this backlog:

1. `npm run discover-gaps` → review `tmp/gap-candidates.json`
2. Pick rows → add `todo` entries here (or promote directly)
3. `npm run find-mdb -- "Agency Name" slug "lat,lon"` to confirm feed

Then process and publish — see [`MAP_UPDATES.md`](./MAP_UPDATES.md) § Batch Processing and Publishing for the actual steps (config, refresh, PMTiles rebuild + verify) — and mark `done` here plus note it in `CHANGELOG.md` once published.

---

[Back to Agencies](AGENCIES.md) · [Data](DATA.md)
