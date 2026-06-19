# Strategy

Competitive context and long-term product positioning.

---

## Where Atlas sits

The main players in transit analytics are Remix (Via), Swiftly, and Optibus. All three are agency-facing SaaS products with sales teams and long procurement cycles. Atlas approaches the same problem differently: collect data first, sell access to it later.

| Feature | Atlas | Remix | Swiftly | Optibus |
|---------|-------|-------|---------|---------|
| Frequency mapping | Automatic from GTFS | Manual/auto | Static only | No |
| Real-time headway tracking | In progress | No | Yes | Yes |
| Historical schedule snapshots | In progress | No | No | No |
| Adherence analysis | In progress | No | Yes | No |
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

[Back to Roadmap](../ROADMAP.md)
