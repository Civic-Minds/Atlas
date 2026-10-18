Goal: fix the fare-discount research in ~/Documents/Atlas Research/fare-discounts-2026-10/ so every row is complete and honestly sourced.

Read prompt.md (the original research rules) and audit-2026-10-10.md (an independent audit of your last pass) first. The audit found real problems. Fix them; do not argue with them.

Work agency by agency. Do not bulk-rewrite files. Save each batch CSV only after you have actually researched its rows. Write a checkpoint after each batch that lists the agencies you opened pages for.

1. Fill the 186 rows that have only a URL and quote. Every verified row needs the program name, the discount amount, and who qualifies. These are all of B18–B21, plus the partly empty rows in B06–B09, B11–B13 and B15. If you cannot find these details on an official page, change the row's status. Do not leave it "verified".
2. Quotes must be copied word for word from the cited page. Never paraphrase inside the quote field. If the wording is in a PDF, cite the PDF URL. Re-check the paraphrased rows: Redwood Coast, RiverCities, TriMet and Staten Island Ferry.
3. Official sources only: the agency's own site, or the city, county or state government site that runs it. No preview or staging copies (e.g. vercel.app), airport sites for a city transit agency, software vendor sites, Moovit or Wikipedia. Fix Greeley, Dubuque and Clemson.
4. A quote must be on the exact page cited. Fix MARTA, BC Transit (Cowichan, plus the same quote reused about 12 times on the bctransit.com homepage), exo Presqu'île and SMART Telluride.
5. Exclude paratransit fares (Mason City).
6. Fix these statuses:
   - CUE: fare-free.
   - Saint-Jean-sur-Richelieu: verified (60+, students, ages 12–17).
   - GET Bakersfield: verified (senior, Medicare, disability).
   - WVU PRT: re-check, and pick one status only.
   - Tampa Airport shuttle: fare-free.
   - Remove the duplicate none-found rows for CUE and WVU PRT.
7. Fix the dead UP Express link.

When you finish, report:
- the per-batch row counts by status;
- how many rows you changed;
- a list of any rows you could not complete and why.

Do not call the goal complete while any verified row has a blank program, amount or eligibility field.
