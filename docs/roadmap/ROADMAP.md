# Roadmap

Atlas is a regional transit atlas for understanding where transit runs frequently, how service changes, and—where available—how it performs in practice. It began in the Greater Golden Horseshoe and is expanding outward.

- **[Vision](../product/VISION.md)**: Product philosophy — frequency mapping to live performance evidence and long-term accumulation of real service data.

### Product and platform
- **[Product](./PRODUCT.md)**: Map apps (Frequency Map, History), live data layer, filters, design principles.
- **[Platform](./PLATFORM.md)**: History & change analysis, public tools (shareable views, multi-agency merges).
- **[Technical](./TECHNICAL.md)**: Future engineering direction for live data, rendering, and analysis infrastructure.

### Atlas Studio

The planner toolkit, local only for now (DECISIONS.md, 2026-11-15).
- **First page: Live** (CIV-1828): the Live tool's route performance views, in the Studio shell (page menu, agency menu, address). Ryan, 2026-11-17: "1 but second page is to be determined later".
- **Second page: Schedules** (CIV-1828): the before/after schedule changes are their own Studio page, off Fleet. Ryan, 2026-11-20: "Should Schedule be another page instead", and he chose 1.
- **Fleet** (placeholder name, CIV-1828): shows the buses the whole agency needs, for Kingston, HSR and RTD. Ryan, 2026-11-17: "We can add Fleet as a placeholder perhaps".

### Future (not now)

Both depend on a licence decision for Atlas's data (Ryan, 2026-11-17).
- **Open data**: publish route, stop, map and freshness data that other transit tools can build on, with a licence to match.
- **Atlas Studio for AI assistants, public**: lets any AI assistant query Atlas frequency data. A private version already runs on Ryan's Mac as part of Atlas Studio (CIV-1650).

---

### Status

- **Corridors:** retired 2026-10-13; its old URLs redirect to the map. This is the one place the status is stated.
- **Live:** see [Feature flags](../FEATURE_FLAGS.md), the one place its status is stated.

---

Strategy, research, decisions and every other doc are listed in the [documentation index](../README.md).

Ideas kicked around just for fun, no commitment: [Experiment ideas](./EXPERIMENT_IDEAS.md).
