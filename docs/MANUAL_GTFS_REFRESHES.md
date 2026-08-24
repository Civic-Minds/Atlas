# Manual GTFS refresh queue

Snapshot from the expired-source audit on 2026-08-24. These agencies have no
verified replacement that Atlas can currently download automatically.

| Agency | Why it needs manual work | Next action |
| --- | --- | --- |
| Augusta Transit | Official archive URL returns 404; Mobility Database copy is expired | Find a current agency feed or request one from Augusta Transit |
| LAVTA / Wheels | Official ZIP exists but service ended 2026-04-30 | Find the current Wheels schedule export |
| PVTA | Official ZIP is current, but the site returns HTTP 403 to Atlas | Ask PVTA to allow automated downloads or provide an accessible mirror |
| West Berkeley Shuttle | Cal-ITP URL returns HTML instead of a ZIP; catalog copy is expired | Confirm whether the shuttle still operates and locate its current feed |

Do not replace these URLs with an older catalog snapshot just to clear the
warning. Re-run the read-only audit after each source change:

```sh
npm run audit-expired-sources
```

Once a replacement is validated by agency identity and active service dates,
update its config and run:

```sh
npm run refresh -- <slug>
```
