# Finding New Agency Candidates

Maintainer and contributor runbook for discovering new transit agencies to add to Atlas, and looking up their feeds. This is repository documentation, not user-facing product documentation.

Once a candidate is found here, see [`ADDING_AGENCIES.md`](ADDING_AGENCIES.md) to actually onboard it.

## Querying Mobility Database

```bash
npm run find-mdb -- "[search query]" <slug> "[lat,lon]"
# Example:
npm run find-mdb -- "Hamilton Street Railway" hamilton "43.25,-79.87"
```

## Coverage Gap Discovery

```bash
npm run discover-gaps
npm run discover-gaps -- --region Ontario --limit 20
npm run discover-gaps -- --min-pop 100000
```

Candidates are written to `tmp/gap-candidates.json`.

---

[Back to Data](./DATA.md)
