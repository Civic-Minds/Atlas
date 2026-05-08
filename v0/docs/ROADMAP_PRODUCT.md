# Product Roadmap

This document outlines the user-facing trajectory of the Atlas platform.

## Current Focus: Visual Intelligence
Moving beyond tables to provide scannable, insight-first dashboards for transit planners.

---

## 1. Analytics & Dashboards
- [x] **Modular Performance View**: Deconstruct monolith into isolated tab components (Ghosts, Dwells, Bottlenecks). [SHIPPED]
- [ ] **Friction Sparklines**: Small trend lines in performance tables showing if reliability is improving or degrading over the selected window.
- [ ] **Vertical Segment Maps**: For the Adherence tab, show a vertical "thermometer" of a route where red segments highlight precisely where delay builds up physically.
- [ ] **Ghost Presence Heatmaps**: Visualize when in the day a route is most likely to go dark.

## 2. Mapping & Geospatial
- [x] **Live Vehicle Map**: High-frequency position updates across the fleet. [SHIPPED]
- [ ] **OTP Map Layer**: Color-code route segments by actual observed speed vs. scheduled speed.
- [ ] **Catchment/Walkshed Analysis**: Population density overlays against actual frequent service levels.

## 3. Reporting & Proactive Intelligence
- [ ] **Board Report Export**: "One-click PDF" generation summarizing an agency's reliability for the last 30 days.
- [ ] **Threshold Alerts**: Push notifications to Notion/Slack when a high-frequency route's headway exceeds its promise by >50%.
- [ ] **Public Dashboard**: Publicly shareable, simplified view of agency performance for transparency.

---

[Back to Roadmap](../ROADMAP.md)
