# Atlas Strategy

Competitive context and long-term product positioning.

---

## Where Atlas sits

The main players in transit analytics are Remix (Via), Swiftly, and Optibus. All three are agency-facing SaaS products with sales teams and long procurement cycles. Atlas approaches the same problem differently: collect data first, sell access to it later.

| Feature | Atlas | Remix | Swiftly | Optibus |
|---------|-------|-------|---------|---------|
| Frequency mapping | Automatic from GTFS | Manual/auto | Static only | No |
| Real-time headway | Planned | No | Yes | Yes |
| Historical snapshots | Planned | No | No | No |
| Isochrone / travel-time | Planned | Yes (industry standard) | No | No |
| Equity / Title VI | Planned | Yes (best-in-class) | No | No |
| Scenario sandbox | Planned | Yes (core) | No | Yes (core) |
| Open public view | Yes | No | No | No |

The main gap vs. Remix is scenario planning and travel-time analysis. The main gap vs. Swiftly is live operations monitoring. Atlas's advantage: it accumulates historical data passively and offers a public-facing map that agencies can share, which neither Remix nor Swiftly provide.

---

## The data flywheel

The live data layer (GTFS-RT archiving → Postgres → pattern analysis) is the core business logic:

1. Atlas watches agency networks continuously
2. Historical data accumulates
3. Atlas surfaces patterns the agency can't see in their own tools
4. Agency subscribes to see their own data in context

An agency doesn't need to set up anything — Atlas has already been watching before they subscribe. That's the pitch.

---

## Who pays

Transit planner or analytics team at a mid-sized agency. Not the executive level. The value prop is time savings on work they're already doing (NTD reporting, OTP analysis, board presentations) and evidence they currently can't produce at all (before/after service change, segment-level lateness).

Target: ~$500/month per agency. Mid-sized agencies (10–100 buses) are the sweet spot — large enough to have planning staff, small enough not to have Swiftly already.

---

## Access model (future)

| Tier | Who | Sees |
|------|-----|------|
| Public | Anyone | The frequency map and public performance data |
| Agency | Subscribing agency | Their own reliability data + regional benchmarks |
| Regional | MPO or regional authority | All agencies in their geography |

Agency data is isolated by default — an agency only sees their own numbers plus anonymized regional averages.

---

[Back to Roadmap](../ROADMAP.md)
