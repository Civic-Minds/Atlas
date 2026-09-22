# GitHub Issue Filing Guidelines

Rules for **all AI agents** (Claude, Grok, Gemini, Codex) filing issues in `Civic-Minds/Atlas`.

## General Rules

- **Use issue Types, not Labels** — Set the issue type (`Bug`, `Task`, `Feature`, etc.) via `--type`. Do NOT apply a label that just restates the type as a substitute or duplicate — this means `bug`, but also `enhancement`, `feature`, `task`, or anything else that says the same thing the Type field already says. Labels are for dimensions the Type doesn't capture (`data-quality`, `pipeline`, `live`, `user-reported`).
  - Exception: `data override` label — always apply this label for data override issues (it drives the in-app "Learn more" link).
- **No internal context leaking** — Never include:
  - `Status: Todo` or any tracker status
  - `User query: "..."` or `User request: "..."`
  - `Linear: ...` prefixes
  - `(Linear MCP not available; GitHub fallback per instructions.)` or any excuse about tooling
  - `Full context and image description provided for reference.`
  - `(This issue was to be filed in Linear...)`
  - Local file paths (`/Users/ryan/...`, `/Users/ryan/.grok/sessions/...`)
- **Write like a human** — The issue should read as if a developer filed it, not a transcript of a chat session.
- **Keep it concise** — State the problem, expected behavior, and context. No filler.

---

## Handling Screenshots

Ryan will often provide a screenshot with a brief note like "log this as an issue." The agent's job:

1. **Understand the bug** from the screenshot and context — figure out what's actually wrong, don't just echo back what the user said
2. **Write a clear title and body** — the agent should describe the problem *better* than the user did (that's the point)
3. **Title from what's actually on screen** — the screenshot almost always shows a real agency/route/stop name and the actual wrong value. Put that in the title instead of a generic surface description: `LA Metro 182: Westbound Midday shows 2 min headway next to 30 min` beats `Suggested routes: every row shows every 1m`. See the "Prefer a concrete example" rule under Standard Issues below.
4. **Describe the image naturally** — since `gh issue create` cannot upload images, weave a description of what's shown into the body text where it's relevant. Don't dump a raw list of every UI element visible. Focus on what matters for the bug.
5. **Never include** `[Image #1]` placeholder references, local file paths to screenshots, or raw image metadata

### Good image description (woven into the issue body):

```
The route card for GRTC BRT shows only "to Main/Broad/Willow Lawn · every 10 min"
with no second direction listed. The outdated-schedule banner is also visible
(feed ended May 18, 2024).
```

### Bad image description (raw dump):

```
[Image #1]
Image path: /Users/ryan/.grok/sessions/.../image-xyz.png
Screenshot details from the image:
   - Agency: Capital District Transportation Authority
   - Route: 910 — Busplus Purple Line
   - The title in the route card / panel shows "910 — Busplus Purple Line"
   - Period shown: Midday
   - Destinations: to Downtown Albany (every 20 min), to Crossgates Mall (every 20 min)
```

The good version picks out exactly what's relevant. The bad version reads like OCR output.

### Triage before filing

A screenshot or in-app report is evidence, not automatically a new standalone issue. The agent is responsible for determining whether it is a new defect, a duplicate, or another example of an existing systemic problem.

Before creating an issue:

1. Search open and recently closed issues by agency, route, field, and subsystem.
2. Identify the first layer where behavior diverges: upstream GTFS, processing, published artifact, PMTiles, shared projection, or UI state/presentation.
3. If the same root cause already has an issue, add the new reproduction there or create a native GitHub sub-issue under that parent. Do not create another independent ticket just because the screenshot shows a different route or screen.
4. Create a new parent issue only when the underlying problem is genuinely new. Concrete routes, agencies, and screenshots belong as examples or sub-issues beneath it.
5. Close confirmed repeats as `Duplicate` and link the issue they duplicate.

Every investigated report should capture this reasoning, either in the issue body or in a triage comment:

```text
Root cause:
Affected layer:
Canonical source:
Other affected surfaces:
Regression test or audit:
Related issues:
```

The goal is to fix the shared cause once and add a regression check, rather than repeatedly patching each visible symptom.

### Format for individual user reports

A screenshot/in-app report that gets filed as its own issue (not folded into an existing systemic issue) uses this template instead of the Standard format below — it's the triage reasoning above, as the body:

**Title:** `{Agency} {Route}: {concise problem}` — same rule as Standard Issues.

**Label:** always apply `user-reported`.

**Body:**

```
## Reproduction
{URL or steps to see the reported view}

## Expected
{what should happen}

## Actual
{what happens instead}

## Root cause
{first divergent layer — see "Triage before filing" above}

## Other affected surfaces
{what else this touches}

## Regression test or audit
{how to verify the fix}

## Related issues
- {systemic parent issue, if one exists}
- User report: #{this issue}
```

Still set `--type Bug` (or `Task`) — a different body template is not a substitute for the issue Type; that rule under General Rules applies here too.

**The systemic issue a group of these reports gets folded into is not itself a user report** — write that one in the Standard format below, not this one. Mixing them up (using this template for the systemic parent, or leaving its Type unset) is the exact drift this section exists to prevent.

---

## Standard Issues (bugs, features, tasks)

### Format

**Title:** `{Agency} {Route}: {concise problem}` or `{Component}: {concise problem}`

- **Prefer a concrete example over an abstract surface name.** If there's a real reproduction case (a specific agency/route/stop), use that in the title — even when the underlying cause is a general/systemic bug affecting many surfaces. It's more scannable than naming the UI component, especially when skimming a flat list of sub-issues without their parent's context. `LA Metro 182: Westbound Midday shows 2 min headway next to 30 min on same route` beats `Suggested routes: every row shows every 1m`.
- **State the discrepancy, not just the observed value.** A title should make clear *why* something is wrong without opening the issue. "Near You: headways look unrealistically frequent" works because "unrealistically" flags it as wrong; a bare value like "every row shows every 1m" doesn't say anything is broken.

**Body:**

```
{One-sentence summary of the problem.}

**Expected:** {what should happen}
**Actual:** {what happens instead}

{Any relevant detail: which period, which routes, steps to reproduce, etc.}
```

### Example

**Title:** `GRTC BRT: route card shows only one destination`

```
The route card for GRTC Transit BRT shows only one direction ("to Main/Broad/Willow Lawn")
instead of both.

**Expected:** Both directions listed (e.g. "to Main/Broad/Willow Lawn" and "to Rocketts Landing")
**Actual:** Only one "to ..." destination appears

GRTC BRT runs every 10 min midday. The outdated-schedule banner is also showing
(feed ended May 18, 2024).

See also #82 for the same single-direction issue on other GRTC routes.
```

### Anti-patterns (do NOT do this)

```
User query: "[Image #1] more routes showing only one direction here"
Status: Todo
(This issue was to be filed in Linear Atlas project as status Todo but Linear MCP tools
   not available; falling back to GitHub per instructions.)
Image path: /Users/ryan/.grok/sessions/.../image-xyz.png
Full context and image description provided for reference.
Linear: I can confirm there's more than 4 routes on the screen right now too [Image #1]
```

---

## Data Override Issues (user-facing)

These issues are linked from the app UI ("Learn more →") when we apply overrides to fix bad GTFS data. **Regular people will read these.** The first sentence must explain the situation in plain language.

### Rules
- Always apply the `data override` **label**
- Set issue type to `Task`
- Title format: `{Agency Name}: {plain-language description}`
- Body must start with a **plain-language sentence** anyone can understand
- Technical details (override config, GTFS field names) go below a `---` separator

### Format

```
{One plain-language sentence explaining what's wrong and what we did.}

---

**Override:** `{field}: {value}` in `index.json`
**Reason:** {technical detail about the upstream GTFS problem}
**Fix:** {what needs to happen upstream for us to remove this override}
**Added:** {month year}
```

### Example

**Title:** `Stratford Transit: exclude seasonal LOS route (Lights On Stratford)`

```
The "Lights On Stratford" shuttle is a seasonal hop-on hop-off route that only runs
mid-December to mid-January, but it was showing up on the map year-round. We've hidden
it until the transit agency fixes their schedule data.

---

**Override:** `excludeRouteShortNames: ["LOS"]` in `index.json`
**Reason:** The upstream GTFS feed marks LOS as operating every Thursday–Sunday year-round
via incorrect `calendar.txt` entries.
**Fix:** Remove `LOS` from `excludeRouteShortNames` once Stratford Transit corrects their
GTFS `calendar.txt` to reflect actual seasonal dates.
**Added:** June 2026
```

---

## Integration / Multi-Repo Issues

For issues that coordinate changes across multiple tools (e.g., `Transit Stats`, `Bridge`, `Dispatch`, or `Reroute` consuming `Atlas` datasets or APIs).

Two shapes, depending on direction:

### A. Atlas provides a capability to one or more consumers (platform work)

Atlas is building/publishing something reusable; the consumer(s) do their own adapter work as a separate issue in their own repo, only linked here.

**Rules**
- Set issue type to `Task`
- Title: plain description of the capability, no bracket prefix — e.g. `Live provider: Expose a versioned GTFS-RT contract`
- Use `**Owner:**` (always Atlas) and `**Consumers:**` (who benefits, can be plural/open-ended)
- `**Implementation scope:**` is a flat bullet list of what Atlas ships — not per-consumer checkboxes, since consumers build their own side independently
- Link each consumer's own tracking issue under `**Consumer dependency:**`

**Format**

```
{One-sentence summary of the capability.}

**Owner:** Atlas
**Consumers:** {Tool name(s), e.g. Bridge and other transit tools}

**Goal:**
{Clear description of what this achieves.}

**Implementation scope:**
- {What Atlas ships, one bullet per piece}

**Consumer dependency:**
{Consumer} tracks its adapter work in {Org/Repo#N}.
```

**Example** — see [#195](https://github.com/Civic-Minds/Atlas/issues/195) (`Live provider: Expose a versioned GTFS-RT contract`).

### B. Atlas is asked to change something for one specific consumer (one-off task)

A single named consumer needs Atlas to expose or change something specific, and both sides' steps are being tracked in the same issue.

**Rules**
- Set issue type to `Task`
- Prefix title with the target consumer tool in brackets: `[{Consumer}] Integration: {concise goal}`
- Specify the consumer and provider clearly in the body
- List clear, decoupled implementation steps for both provider and consumer

**Format**

```
{One-sentence summary of the integration goal.}

**Consumer:** {Target tool name, e.g., Transit Stats, Reroute}
**Provider:** {Source data or API from Atlas, e.g., atlas/{slug}-routes.json}

**Goal:**
{Clear description of what this integration achieves.}

**Implementation Steps:**
- [ ] **Provider (Atlas)**: {what needs to be modified or outputted by Atlas}
- [ ] **Consumer ({Consumer})**: {how the consumer implements or renders the data}
```

**Example**

**Title:** `[Transit Stats] Integration: Load RouteTracker from Atlas R2`

```
Refactor the personal route completion tracker in Transit Stats to load route definitions from the Atlas R2 bucket rather than querying local Firestore.

**Consumer:** Transit Stats
**Provider:** Atlas R2 (`atlas/{slug}.json` or `{slug}-routes.json`)

**Goal:**
Remove the dependency on local Firestore route collections and manual GTFS CSV uploads, keeping Transit Stats automatically updated with weekly route schedules.

**Implementation Steps:**
- [ ] **Provider (Atlas)**: Expose a lightweight `{slug}-routes.json` sidecar via the weekly build pipeline to keep load sizes small.
- [ ] **Consumer (Transit Stats)**: Update `_getRoutes` in `route-tracker.js` to fetch this new JSON file from the public R2 bucket.
```

---


## Issue Lifecycle

### Investigation notes

Post real findings as issue comments while investigating, not just at close time — root cause, what's been ruled out, what's still unchecked. This is what lets `HANDOFF.md` (or the next session, by any tool) just say "see issue #N" instead of re-deriving or duplicating the investigation. Don't wait for a fix to comment; a comment on an open, unresolved issue with "confirmed X, haven't checked Y yet" is exactly the useful case.

### Closing issues (preferred workflow)

**Close via commit on push — not `gh issue close`.** This is the standard Atlas workflow and works on machines where `gh issue edit` / `gh issue close` are blocked.

| Step | What |
|------|------|
| 1 | Fix the bug (code and/or data reprocess as needed) |
| 2 | Update `CHANGELOG.md` **`[Unreleased]`** first |
| 3 | Commit with a short grouped summary + one `Closes #N` line **per issue** |
| 4 | Push to `main` (or merge PR) — GitHub auto-closes linked issues |

**Do not** use issue ranges (`Closes #80-84` does not work). List each number:

```
Closes #80
Closes #81
```

**Commit message shape** — one subject, optional grouped body bullets, then `Closes` lines. Do **not** write a per-issue "how we fixed it" paragraph in the commit; that detail belongs in `CHANGELOG.md`.

```
fix: GRTC directions, map badge filter, RGRTA ranges, BusPlus casing

- Union full-route shape clusters so weekday/weekend shapes don't drop directions
- Align PMTiles tileFilter with passesRouteFilter
- Per-headsign trunk headways for route-card ranges
- BusPlus branding in titleCase

Closes #80
Closes #81
Closes #82
Closes #83
Closes #84
```

**CHANGELOG vs commit:** Group related fixes in one changelog bullet (or a few). Issue numbers only need to appear in the commit footer for auto-close — not repeated in every changelog line.

**`[Unreleased]` (never empty on `main`):**
- **During work:** accumulate entries under `[Unreleased]` until release.
- **On version bump:** move all `[Unreleased]` entries to `## [X.Y.Z] — date`, then **remove the `[Unreleased]` header** — do not leave an empty stub.
- Either the section has pending items (A) or they were versioned and the section is gone (B).

**Optional:** `gh issue comment` on a machine that has edit access, only when the fix is not obvious from the commit. Not required if the commit + changelog are clear.

**Do not use `gh issue close` directly** for normal bug fixes — the issue should close when the fix lands on the default branch.

---

**Standard issues (bugs, features):**
1. Create issue describing the problem (`gh issue create`)
2. Fix later (could be same session or weeks later)
3. Changelog entry → commit with `Closes #XX` → push
4. GitHub auto-closes on push/merge

**Data override issues:**

The override is **not** a frontend hack. A feed-specific normalization rule (or `excludeRouteShortNames` when whole routes must be removed) tells the pipeline to strip or correct bad records before publishing artifacts to R2 (`atlas/{slug}.json`, etc.). The agency/route card shows "We corrected this data" opening an in-app explanation when `overrideNote` is set. GitHub issues remain for internal tracking only.

1. Create the GitHub issue (`data override` label) documenting what upstream got wrong
2. Add the corrective preprocessing/configuration plus a plain-language `overrideNote` to `index.json`
3. Re-process or refresh the agency so R2 artifacts are rebuilt without the bad routes
4. Changelog + **commit with `Closes #N`**
5. **When upstream publishes a new GTFS file:** weekly refresh clears `overrideNote` from `index.json` (the card stops linking until you re-verify). Any corrective preprocessing/configuration remains so bad data does not silently reappear while you check. If the bad data is still there, file a **new** issue, restore `overrideNote`, and commit with `Closes #N`. If upstream fixed it, remove the corrective override too.

### Data-quality review history

Feed-specific issues should not permanently flag an agency. Atlas keeps the reviewed-feed history in `config/feed-review-history.json`, separate from the public agency config. An agency enters review-on-next-feed when at least **2 of its last 10 reviewed feeds** had confirmed issues; fewer than 3 reviewed feeds is not enough history to trigger the rule.

When a flagged agency receives a new feed, the refresh clears the old feed-specific `issueUrl`/`overrideNote` and sets `feedReviewStatus: "review"`. The app shows a neutral “New schedule data is being verified” notice. After checking that exact feed, record the result and regenerate the runtime index:

```bash
npm run record-feed-review -- <slug> <clean|issue> <feed-expiry-or-version> [issue-url]
npm run build:agency-index
```

If the feed still has a problem, add a new feed-specific GitHub issue and `overrideNote`. The agency’s review history remains so future feed changes can be checked automatically.

---

## Issue Fields (Priority / Effort)

Civic-Minds org-level custom Issue Fields — **not** GitHub Projects (there is no Project for Atlas; don't go looking for one). They show up in the right sidebar of the issue page itself, under "Fields."

- Read the field/option definitions: `gh api orgs/Civic-Minds/issue-fields` — returns each field's `id` and its `single_select` `options` (each with its own `id` and `name`).
- Set them with a raw JSON body (mixing `-f`/`-F` flags for array elements does not work reliably):
  ```bash
  cat <<'EOF' | gh api repos/Civic-Minds/Atlas/issues/<N> --method PATCH --input -
  {
    "issue_field_values": [
      { "field_id": 39256322, "value": "Medium" },
      { "field_id": 39256325, "value": "Medium" }
    ]
  }
  EOF
  ```
  `field_id` is the field's numeric id. `value` is the **option's name as a string** (e.g. `"Medium"`), not its numeric option id — passing the option id there fails with a 422.
- Current field ids: `Priority` = `39256322` (options: Urgent/High/Medium/Low), `Effort` = `39256325` (options: High/Medium/Low). Re-check with the `issue-fields` call above if these ever stop working — ids aren't guaranteed stable.

## `gh` on this machine

| Action | Available? |
|--------|------------|
| `gh issue create` | Yes |
| `gh issue view` / `gh issue list` | Yes |
| `gh issue edit` / `comment` / `close` | Yes (confirmed 2026-07-16 — previously thought blocked; that was stale) |

Prefer commit-based auto-close for normal bug fixes (still the standard workflow below) — `gh issue close` is fine for issue hygiene (e.g. closing something already fixed on `main` but never linked to a `Closes #N` commit), just don't use it to skip the changelog → commit → auto-close flow for new fixes.

---

## `gh` Quick Reference

```bash
# Standard bug
gh issue create --title "..." --type "Bug" --body "..."

# Data override
gh issue create --title "..." --type "Task" --label "data override" --body "..."
```
