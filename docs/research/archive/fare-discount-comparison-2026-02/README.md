# Low-income fare discount comparison (February 2026)

Archived snapshot of a small standalone prototype that compared low-income transit fare discount programs in California: Clipper START (Bay Area), LA Metro LIFE, San Diego PRONTO and others.

**Status: unverified.** The figures were gathered in February 2026 with the AI research prompt in `prompt_draft.md` and have not been checked against official agency sources since. Atlas does not use this data in the product. Any reuse needs a fresh, source-backed pass first, for example alongside `../fare-inventory-2026-09-30/`.

## Files

- `data.json`: one record per program, covering program name, agency, single-person income threshold, poverty-level basis, discount type and value, and verification method.
- `index.html` and `style.css`: the original comparison-table page, which reads `data.json`.
- `prompt_draft.md`: the research prompt that produced the data.
