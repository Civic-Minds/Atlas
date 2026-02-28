# Atlas

A transit intelligence platform for mobility precision in North American metros.

## Problem
The modern transit planning process is fragmented. Agencies juggle siloed GTFS feeds, manual audits, and complex simulation tools without a unified strategy. This disconnect between data and design leads to inefficient networks and unreliable service. Atlas bridges this gap by turning raw transit data into a closed-loop system for auditing, modeling, and sharing the network.

## Features
- **Screen**: Automated GTFS-static analysis with two-phase engine — raw departure extraction per individual day, then configurable criteria application with tier classification. Full audit view with departure tables, gap distribution charts, and headway timelines.
- **Catalog**: Persistent multi-agency route database. Commit screened routes with inline shape geometry. Supports route history tracking, schedule change detection, and verification status inheritance across feed uploads.
- **Atlas**: Map visualization of all cataloged routes, filterable by frequency tier and agency. Auto-zoom, dark/light basemaps, route popups with verification status.
- **Simulate**: High-fidelity stop consolidation and performance modeling.
- **Verify**: Human-in-the-loop validation interface — Mark Verified / Flag / Skip with notes, persisted per-route.

## The Stack
- **Frontend**: React 19, Vite 7, TypeScript 5.9, Tailwind CSS, Framer Motion
- **Architecture**: Zustand (Global State Management), Web Workers (Off-thread GTFS Parsing)
- **Data**: IndexedDB (Persistent Route Catalog + Feed History), Papaparse (CSV), JSZip
- **Mapping**: Leaflet, React Leaflet
- **Testing**: Vitest (108 tests)

---
[Roadmap](ROADMAP.md) • [Changelog](CHANGELOG.md) • [Security](SECURITY.md)

Created by [Ryan Hanna](https://github.com/ryanphanna) | [ryanisnota.pro](https://ryanisnota.pro)
