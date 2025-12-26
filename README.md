# Frequent Transit Networks

Building a longitudinal database of transit service quality across North American metropolitan areas.

## The Problem

We know transit service has declined over the past two decades. But **by how much?** Which cities improved? Which routes maintained frequency? 

Without standardized measurement, we can't answer these questions. This project provides the missing evidence base.

## The Vision

A public database enabling comparative transit research:

1. **The Screener** - [GTFS Frequency Screener](https://github.com/ryanhanna/GTFS-Screener) analyzes GTFS data using standardized methodology
2. **The Atlas** - This repository stores and displays results over time
3. **Open data** - All analyses publicly available for research

## What We're Mapping

### Interactive Map
View transit routes colored by service frequency tier.

### Agency Catalogs  
Browse route-by-route breakdowns for each transit system.

### Coming Soon
- Historical timeline views showing service changes
- Multi-city comparison tools
- Frequent network maps (routes ≤15 min only)
- Downloadable datasets for researchers

## Classification System

Routes are classified by maximum scheduled headway:

- **Freq+ (≤10 min)** - Very frequent
- **Freq (≤15 min)** - Frequent  
- **Good (≤20 min)** - Good service
- **Basic (≤30 min)** - Basic service
- **Infreq (≤60 min)** - Infrequent
- **Sparse (>60 min)** - Sparse service

This creates a standardized framework for comparing service across cities and tracking changes over time.

[Full methodology →](https://www.notion.so/lowandhigh/Transit-Networks-ea714af9cebb4430bad9d642dc8afc96)

## Data Structure
```
/data/
  /checks/
    spokane-transit_2025-12-26.json
    spokane-transit_2025-07-15.json
    ttc_2025-12-24.json
```

Each check captures a complete snapshot of an agency's service at a specific date.

## How You Can Help

**Suggest agencies to analyze:** [Open an issue](https://github.com/ryanhanna/FrequentTransitNetworks/issues) with agency name and GTFS source

**Flag errors:** If you spot incorrect classifications, [report them here](https://github.com/ryanhanna/FrequentTransitNetworks/issues)

**Spread the word:** Share with transit researchers, journalists, and advocates

## Research Applications

- **Transit advocacy**: Evidence-based arguments for service improvements
- **Investigative journalism**: Document service cuts or improvements  
- **Academic research**: Longitudinal analysis of transit quality
- **Policy evaluation**: Track impacts of funding decisions

## Example Research Questions

- How has Toronto's frequent network changed since 2020?
- Which North American cities provide the most frequent transit?
- What percentage of urban routes maintain ≤15 min headways?
- How stable is frequent service year-over-year?

## Current Coverage

**Cities analyzed:** Check `/data/checks/` for current inventory

**Timeline:** Building 5-10 year datasets starting 2025

## Technology Stack

- Leaflet for interactive mapping
- GeoJSON route geometries
- JSON check exports
- GitHub Pages hosting
- Python ETL for data processing

## Inspiration

Inspired by [TransitLand](https://www.transit.land/)'s GTFS cataloging and the [TPFS proposal](https://interactive-or.com/blog/transit-planning-feed-specification-proposed) for enhanced transit data standards.

## License

- Code: MIT License  
- Data: CC BY 4.0 (attribution required)

---

**Project by Ryan Hanna** | [ryanisnota.pro](https://ryanisnota.pro) | [Behind-the-Scenes](https://www.notion.so/lowandhigh/Transit-Networks-ea714af9cebb4430bad9d642dc8afc96)
