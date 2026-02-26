# Atlas

A transit intelligence platform for mobility precision in North American metros.

## Problem
The modern transit planning process is fragmented. Agencies juggle siloed GTFS feeds, manual audits, and complex simulation tools without a unified strategy. This disconnect between data and design leads to inefficient networks and unreliable service. Atlas bridges this gap by turning raw transit data into a closed-loop system for auditing, modeling, and sharing the network.

## Features
- **Screen**: Automated GTFS-static analysis and route-level frequency tiering.
- **Simulate**: High-fidelity stop consolidation and performance modeling.
- **Verify**: Human-in-the-loop validation interface for data integrity.
- **Optimize**: Generative AI for route optimization and network redesign.
- **Explorer**: National longitudinal database viewer for urban mobility trends.

## The Stack
- **Frontend**: React 19, Vite, Tailwind CSS, Framer Motion
- **Architecture**: Zustand (Global State Management), Web Workers (Off-thread GTFS Parsing)
- **Data**: IndexedDB (Persistence), Papaparse (CSV), JSZip
- **Mapping**: Leaflet, React Leaflet

---
[Roadmap](ROADMAP.md) • [Changelog](CHANGELOG.md) • [Security](SECURITY.md)

Created by [Ryan Hanna](https://github.com/ryanphanna) | [ryanisnota.pro](https://ryanisnota.pro)
