# Strategy

Competitive context and long-term product positioning.

---

## Where Atlas sits

The main players in transit analytics are Remix (Via), Swiftly, and Optibus. All three are agency-facing SaaS products with sales teams and long procurement cycles. Atlas approaches the same problem differently: collect data first, sell access to it later.

| Feature | Atlas | Remix | Swiftly | Optibus |
|---------|-------|-------|---------|---------|
| Frequency mapping | Automatic from GTFS | Manual/auto | Static only | No |
| Real-time headway tracking | Paused in the product ([Feature flags](../FEATURE_FLAGS.md)); TTC streetcar and Hamilton vehicle positions recorded every minute, kept 30 days | No | Yes | Yes |
| Historical schedule snapshots | History app (beta only), agencies with 10 or more years of schedules ([History coverage](../data/DATA_HISTORY.md)) | No | No | No |
| Adherence analysis | Paused in the product: trip updates recorded only for Hamilton (kept 30 days) and Kingston (Atlas Studio demo, kept 60 days) | No | Yes | No |
| Open public view | Yes | No | No | No |

The main gap vs. Swiftly is live operations depth — Swiftly is purpose-built for operations monitoring and has years of data. Atlas's advantage is that it accumulates data passively across a broad regional network, and the public map is something agencies can actually share with riders and stakeholders.

---

## The data flywheel

The live data layer (GTFS-RT archiving → Postgres → pattern analysis) is the core long-term logic:

1. Atlas watches agency networks continuously
2. Historical data accumulates
3. Atlas surfaces patterns the agency can't see in their own tools
4. Agency subscribes to see their own data in context

An agency doesn't need to set up anything — Atlas has already been watching before they subscribe.

---

## Who pays

Transit planner or analytics team at a mid-sized agency. Not the executive level. The value is time savings on analysis they're already doing manually and evidence they currently can't produce at all (segment-level lateness, before/after a schedule change).

Target: ~$500/month per agency. Mid-sized agencies (10–100 buses) are the sweet spot — large enough to have planning staff, small enough not to have Swiftly already.

---

## Access model (future)

| Tier | Who | Sees |
|------|-----|------|
| Public | Anyone | The frequency map and public performance data |
| Agency | Subscribing agency | Their own reliability data |
| Regional | MPO or regional authority | All agencies in their geography |

Agency data is isolated by default — an agency only sees their own numbers.

---

## Focus cities and agencies

The main map covers every agency it can. The deeper products (Live, History, Studio and the vehicles-needed figures) take work per agency, so they go deep in a few places first. This is the one list of those places (CIV-1865, Ryan 2026-11-18). Each product's list of who is in it today lives in its own source, linked below (checked 2026-11-18); this section says where each product should go next.

### Focus areas

| Area | Agencies | Why |
|------|----------|-----|
| Greater Golden Horseshoe | TTC, Hamilton (HSR), Burlington, Brampton, MiWay, Durham Region Transit, YRT, GRT, GO Transit | Where Atlas started. The first pilot planners for the Atlas Studio MCP are here (CIV-1841). |
| Kingston | Kingston Transit | The Studio demo agency: a mid-sized agency (the buyer in "Who pays"), recorded every minute for Studio. |
| Denver | RTD | Already in Studio and History. |
| A small Ontario city | Guelph or Barrie (one, not yet picked; CIV-1806) | Shows the vehicles-needed figures on a small agency. Both are on the map already. |

### Per product

| Product | In it today (source) | Focus |
|---------|----------------------|-------|
| Main map | Every agency in the public catalog, Canada and the US (`npm run report:agency-count`, [Agencies](../data/AGENCIES.md)) | No focus limit. New agencies follow the [Agency backlog](../data/AGENCY_BACKLOG.md). |
| Live | Recording every minute: TTC streetcars and Hamilton, plus Kingston for Studio only. Switched off on every site (`shared/liveArchiveFeeds.ts`, [Live polling](../operations/LIVE_POLLING.md); check with `npm run audit-live-state`) | TTC, Hamilton and Kingston. Other configured feeds stay paused until an agency or consultant asks, or a paid pilot starts. |
| History | Agencies with 10 or more years of schedules, mostly large US systems; from the focus areas, TTC, Burlington, Brampton, GRT and RTD Denver (`shared/data/history-agencies.json`, [History coverage](../data/DATA_HISTORY.md)) | Eligibility stays automatic. Among new candidates, focus agencies go first: Kingston (one more year needed) and Hamilton, which is in Live and Studio but not History. |
| Studio | Kingston (opens first), Hamilton, RTD Denver: the agencies with a Schedule Changes file (`tmp/studio/<slug>-before-after.json`, local only and not in git; `shared/studioAgencies.ts`) | The same three until an agency says yes to the demo (CIV-1680). |
| Vehicles needed (Studio) | Kingston, Hamilton, RTD Denver (`tmp/studio/<slug>-vehicles.json`). TTC has a vehicles file on main but no Schedule Changes file, so Studio doesn't list it. | Add the small Ontario city next. Local and regional bus only (rule below). |
| Atlas Studio for AI assistants (MCP) | Every published agency for schedule questions; Live questions only where Live records ([MCP server](../../scripts/mcp/README.md)) | Pilot planners from the Greater Golden Horseshoe (CIV-1841). |

### Rules

- **An agency joins Live, Studio or the vehicles-needed figures only if it is in a focus area, or an agency or consultant asks for it.** The main map and History have no such limit; History only puts focus agencies first.
- **Intercity coach is out of the vehicles-needed figures (Bustang, CIV-1806).** The figures assume buses cycle back and forth on one route all day. Checked on Bustang's feed on 2026-11-18, the figures break: the feed has no vehicle assignments and no layover on most routes, most periods hold only part of a round trip, and the AM peak shows 0 vehicles needed on North and South against 4 scheduled (the PM peak, 0 against 12 on West). Bustang stays on the main map.
- **Code reads the list, it doesn't copy it.** Today each product's agency list comes from its own files. Moving this list into one shared config that Studio, Live and the MCP read is a follow-up, not built yet.
