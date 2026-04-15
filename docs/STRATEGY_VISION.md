# Atlas Strategic Vision & Product Roadmap

This document serves as the master blueprint for evolving Atlas from a **Transit Diagnostic Tool** into a **Strategic Decision Support Suite**. It captures the critical analysis of the competitive landscape and the architectural path for multi-persona support.

---

## 1. Competitive Critical Analysis
*Comparison against industry leaders: Remix (Via), Swiftly, and Optibus.*

### The Five "Mega-Gaps"
To move from a "Map Viewer" to a "Planner's Essential," Atlas must close these gaps:

1.  **Accessibility (The "Jane" Paradigm):**
    *   **Need:** Real-time isochrone (travel-time) generation.
    *   **Outcome:** Move beyond "frequency mapping" to "access-to-opportunity mapping" (e.g., "How many jobs can Jane reach in 30 mins?").
2.  **Demographic Equity (Title VI):**
    *   **Need:** Hard-coded US Census (ACS) and international demographic overlays.
    *   **Outcome:** Automated "Service Equity Reports" for civil rights compliance during service changes.
3.  **Financial Modeling & PVR:**
    *   **Need:** Resource calculator that translates frequency into **Peak Vehicle Requirement (PVR)** and operating costs ($/mile, $/hour).
    *   **Outcome:** Ensuring a plan is physically and financially possible to drive.
4.  **Scenario Branching (The Sandbox):**
    *   **Need:** A "Draft" environment where users can draw new routes or edit headways without affecting the baseline catalog.
    *   **Outcome:** High-fidelity A/B testing of network redesigns.
5.  **EV Transition Logic:**
    *   **Need:** Battery discharge and range modeling based on topography and temperature.
    *   **Outcome:** Aiding agencies in the multi-billion dollar transition to zero-emission fleets.

---

## 2. Multi-Persona Access Model
*Solving the "NYC vs. LA" and "Planner vs. Researcher" visibility problem.*

### Three-Tier Authorization
| Persona | Access Level | Primary Focus | Visibility |
| :--- | :--- | :--- | :--- |
| **Agency Planner** | `Tenant` | Daily Ops & Local Planning | **Isolated:** Only sees their own agency data and private "Draft" scenarios. |
| **MPO / Regional** | `Regional` | Regional Connectivity | **Grouped:** Sees all agencies within their specific geography (e.g., LA County). |
| **Researcher / Creator** | `Global` | Macro-Analysis & Benchmarking | **Unlocked:** Global view across all cities; side-by-side comparison tools. |

### Data Separation Strategy
*   **The Global Catalog (Public):** A "Wikipedia of Transit" containing analyzed historical GTFS snapshots for every agency. Open to researchers and the public.
*   **The Sandbox (Private):** Agency-specific "Draft" layers where planners test future changes. Never visible to outsiders or competing agencies.

---

## 3. UI/UX Pivot by Persona
The app should "morph" based on the user's role:

*   **Planner Workspace:** Defaults to the **Monitor** and **Performance** modules. Focuses on "Is my 15-minute network failing *today*?" (Ghost buses, bunching).
*   **Researcher Workspace:** Defaults to the **Atlas (Map)** and **Screener (Catalog)** modules. Focuses on "How has frequency coverage evolved in LA over 2 years?" (Timeline slider, regional reports).

---

## 4. Integration Targets
*   **Notion MCP:** Synchronize agency health scores and "Regional 15-Min Rankings" directly to private Notion databases for stakeholder tracking.
*   **Routing Engines:** Integrate OpenTripPlanner (OTP) or OSRM to power the accessibility/isochrone layers.
*   **Census API:** Automated fetching of demographic blocks for any uploaded GTFS boundary.

---

## 5. Immediate Next Steps
1.  [ ] **Refine Auth Store:** Add `accessLevel` and `tenantId` fields.
2.  [ ] **Tenant Filtering:** Update `CatalogStore` to automatically scope results by `tenantId` for agency users.
3.  [ ] **Sandbox Logic:** Create a schema for "Draft Routes" that coexist with but don't overwrite the Catalog.
4.  [ ] **Accessibility Engine:** Prototype a basic isochrone generator for the Atlas Map view.
