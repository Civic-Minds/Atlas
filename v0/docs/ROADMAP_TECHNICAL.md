# Technical Roadmap

Engineering trajectory for Atlas infrastructure, intelligence engines, and developer experience.

## Current Focus: Architectural Unification
Transitioning from a prototype stack to a formal, maintainable service-oriented architecture.

---

## 1. Backend Architecture
- [x] **Service Layer Pattern**: Extract raw SQL and business logic from `routes.ts` into dedicated `/services` (Agency, Vehicle, Intelligence, Live, Catalog). [COMPLETED]
- [ ] **API Validation**: Implement `Zod` or similar for request schema validation to prevent malformed queries from hitting the DB.
- [ ] **Unified Error Handling**: Global Express middleware to standardize error responses across all service boundaries.

## 2. Data Persistence & Performance
- [x] **PostgreSQL Ingestion**: Multi-agency position snapshots live on OCI. [SHIPPED]
- [ ] **TimescaleDB Migration**: Shift from plain Postgres to TimescaleDB hyper-tables for position history to optimize time-series analytical queries.
- [ ] **Data Retention Worker**: Background process to aggregate raw snapshots into daily summaries and purge data older than 90 days.

## 3. The Matcher Engine (R&D)
- [x] **Trip Assignment**: Correlate GPS pings with static GTFS trip IDs. [SHIPPED]
- [ ] **Spatial Fallback**: Match vehicles based on shape geometry when feed trip IDs are missing or invalid.
- [ ] **Confidence Scoring**: Expose a match-quality metric for every observation to filter noise from performance metrics.

## 4. Infrastructure & DevOps
- [x] **OCI Deployment**: Move production runtime from local to cloud. [SHIPPED]
- [ ] **Pre-flight Deploy Check**: Enhance `deploy.sh` to run `tsc` and `vitest` before pushing code to the server.
- [ ] **Auto-Recovery**: Configure PM2 to automatically restart ingestion workers on memory exhaustion (OOM).

---

[Back to Roadmap](../ROADMAP.md)
