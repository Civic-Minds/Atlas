# Agency lateness and headway policy study

- Study version: `2026-09-26.v1`
- Sample seed: `20260926`
- Sample: 80 agencies — Canada 20, United States 40, France 20
- Scope: fixed-route scheduled service only; on-demand, paratransit, and reservation-window policies are excluded from the Atlas comparison
- Status: sample initialized; 43 of 80 agencies have verified official source sets

## Method

This exploratory study records how agencies themselves define lateness, on-time performance, acceptable headway, bunching, and service reliability for fixed-route scheduled service. On-demand, paratransit, and reservation-window policies may be noted as separate context but do not influence the Atlas frequency comparison. The study does not change Atlas production logic.

Each agency must end with either an official definition, an explicit no-definition-found result, or an inaccessible-source result. Sources must include a URL, title, publisher, access date, and page or section when applicable.

## Atlas baseline

The current pipeline baseline is a minimum 5-minute grace, a 15% grace component, up to 2 grace violations, and a 30% violation allowance. This study evaluates that baseline; it does not alter it.

## Interim comparison with Atlas

Atlas evaluates the gaps between consecutive scheduled departures, not whether an individual vehicle arrived within an agency’s on-time window. For a candidate tier T, Atlas allows a gap up to T + max(5 minutes, round(15% of T)); all larger gaps fail the tier, except that up to max(2, floor(30% of the observed gaps)) may be within that grace band. It also requires at least ceil(span minutes / T) trips.
The reviewed agencies show that these are different concepts: schedule-adherence rules commonly use one-sided or asymmetric minute windows, while explicit headway rules are rarer and may scale with the intended headway. Pierce Transit, for example, uses a fixed-route on-time window plus a separate headway rule; AVTA uses the smaller of half-headway or 10 minutes for a late-trip enforcement threshold. These findings are evidence for keeping schedule punctuality and service-spacing reliability as separate research dimensions; they are not yet a basis for changing Atlas thresholds.

## Initial verified findings

- Niagara uses −1/+5 minutes at published timing points with a 90% target; Greater Sudbury uses no early departures and no more than 3 minutes late with a 90% target.
- GO Transit uses a 5-minute terminal-arrival window for journeys under 90 minutes and 10 minutes for longer journeys.
- RTD-Denver uses less than 1 minute early or up to 5 minutes late for bus and rail.
- COTA defines a late arrival as 5 minutes or more after schedule.
- NFTA publishes different official windows across documents and modes; the study records that discrepancy instead of flattening it.
- LADOT publishes an 85% on-time performance target but no minute-based late-trip window in the reviewed source.

## Sample

| Agency | Country | Region | Size | Mode | Scope | Selection stratum | Schedule policy | Headway policy |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Niagara Transit | Canada | Ontario | medium | bus | static_scheduled | Canada / definition_found | definition_found | not_found |
| Greater Sudbury Transit | Canada | Ontario | medium | bus | static_scheduled | Canada / qualitative_definition_only | definition_found | not_found |
| STL (Laval) | Canada | Quebec | large | bus | static_scheduled | Canada / no_definition_found | definition_found | not_found |
| Burlington Transit | Canada | Ontario | medium | bus | static_scheduled | Canada / definition_found | not_reviewed | not_reviewed |
| Red Deer Transit | Canada | Alberta | medium | bus | static_scheduled | Canada / qualitative_definition_only | not_found | not_found |
| Owen Sound Transit | Canada | Ontario | small | bus | static_scheduled | Canada / no_definition_found | not_found | not_found |
| Guelph Transit | Canada | Ontario | medium | bus | static_scheduled | Canada / definition_found | definition_found | not_found |
| Barrie Transit | Canada | Ontario | medium | bus | static_scheduled | Canada / qualitative_definition_only | definition_found | not_found |
| St. Thomas Transit | Canada | Ontario | small | bus | static_scheduled | Canada / no_definition_found | not_reviewed | not_reviewed |
| Grand River Transit (Waterloo Region) | Canada | Ontario | large | bus | static_scheduled | Canada / definition_found | definition_found | not_found |
| BC Transit (Comox Valley) | Canada | British Columbia | small | bus | static_scheduled | Canada / qualitative_definition_only | definition_found | not_found |
| Ville de Saint-Hyacinthe | Canada | Quebec | small | bus | static_scheduled | Canada / no_definition_found | not_reviewed | not_reviewed |
| UP Express (Toronto) | Canada | Ontario | small | bus | static_scheduled | Canada / definition_found | definition_found | not_found |
| BC Transit (Kelowna) | Canada | British Columbia | medium | bus | static_scheduled | Canada / qualitative_definition_only | definition_found | not_found |
| MiWay (Mississauga) | Canada | Ontario | large | bus | static_scheduled | Canada / no_definition_found | definition_found | not_found |
| Metrobus (St. John's) | Canada | Newfoundland | medium | rail | static_scheduled | Canada / definition_found | definition_found | not_found |
| RTL (Longueuil) | Canada | Quebec | large | bus | static_scheduled | Canada / qualitative_definition_only | definition_found | not_found |
| Moose Jaw Transit | Canada | Saskatchewan | small | bus | static_scheduled | Canada / no_definition_found | not_reviewed | not_reviewed |
| GO Transit | Canada | Ontario | medium | mixed | static_scheduled | Canada / definition_found | definition_found | not_found |
| Cornwall Transit | Canada | Ontario | small | bus | static_scheduled | Canada / qualitative_definition_only | not_found | not_found |
| Bloomington Transit | United States | Indiana | medium | bus | static_scheduled | United States / definition_found | not_reviewed | not_reviewed |
| Santa Rosa CityBus | United States | California | unknown | bus | static_scheduled | United States / qualitative_definition_only | definition_found | not_found |
| SunLine Transit Agency (Coachella Valley) | United States | California | medium | bus | static_scheduled | United States / no_definition_found | definition_found | not_found |
| Central Ohio Transit Authority (COTA) | United States | Ohio | large | mixed | static_scheduled | United States / definition_found | definition_found | not_found |
| Long Beach Transit | United States | California | medium | bus | static_scheduled | United States / qualitative_definition_only | definition_found | not_found |
| Capital Area Transit System (Baton Rouge) | United States | Louisiana | medium | bus | static_scheduled | United States / no_definition_found | definition_found | definition_found |
| Butler County Regional Transit Authority | United States | Ohio | medium | mixed | static_scheduled | United States / definition_found | definition_found | not_found |
| Los Angeles Department of Transportation (LADOT/DASH) | United States | California | large | bus | static_scheduled | United States / qualitative_definition_only | definition_found | not_found |
| Ventura County Transportation Commission (VCTC Intercity) | United States | California | small | mixed | static_scheduled | United States / no_definition_found | not_reviewed | not_reviewed |
| Westchester County Bee-Line System (BeeLine) | United States | New York | unknown | bus | static_scheduled | United States / definition_found | not_reviewed | not_reviewed |
| Capital Transit (Juneau) | United States | Alaska | small | bus | static_scheduled | United States / qualitative_definition_only | not_reviewed | not_reviewed |
| Blue Water Area Transit (Port Huron) | United States | Michigan | small | bus | static_scheduled | United States / no_definition_found | definition_found | not_found |
| Hillsborough Area Regional Transit (HART) | United States | Florida | medium | mixed | static_scheduled | United States / definition_found | definition_found | not_found |
| Jefferson Transit | United States | Washington | small | bus | static_scheduled | United States / qualitative_definition_only | not_found | definition_found |
| Laguna Beach Transit | United States | California | small | bus | static_scheduled | United States / no_definition_found | not_reviewed | not_reviewed |
| Augusta Transit | United States | Georgia | unknown | bus | static_scheduled | United States / definition_found | definition_found | definition_found |
| Blacksburg Transit | United States | Virginia | small | bus | static_scheduled | United States / qualitative_definition_only | not_found | not_found |
| City of Bowling Green | United States | — | small | bus | static_scheduled | United States / no_definition_found | not_reviewed | not_reviewed |
| Durango Transit | United States | Colorado | small | mixed | static_scheduled | United States / definition_found | not_reviewed | not_reviewed |
| Kitsap Transit | United States | Washington | medium | bus | static_scheduled | United States / qualitative_definition_only | definition_found | not_found |
| Chemung County C-TRAN | United States | New York | small | bus | static_scheduled | United States / no_definition_found | not_reviewed | not_reviewed |
| Pierce Transit | United States | Washington | medium | bus | static_scheduled | United States / definition_found | definition_found | definition_found |
| Palos Verdes Peninsula Transit Authority (PVPTA) | United States | California | small | mixed | static_scheduled | United States / qualitative_definition_only | definition_found | definition_found |
| WestCAT (Pinole) | United States | California | small | bus | static_scheduled | United States / no_definition_found | definition_found | definition_found |
| Everett Transit | United States | Washington | medium | bus | static_scheduled | United States / definition_found | not_reviewed | not_reviewed |
| Regional Transportation District (RTD Denver) | United States | Colorado | large | mixed | static_scheduled | United States / qualitative_definition_only | definition_found | not_found |
| Kalamazoo Metro Transit | United States | Michigan | medium | rail | static_scheduled | United States / no_definition_found | not_reviewed | not_reviewed |
| Tompkins Consolidated Area Transit | United States | New York | medium | bus | static_scheduled | United States / definition_found | definition_found | not_found |
| Antelope Valley Transit Authority (AVTA) | United States | California | medium | mixed | static_scheduled | United States / qualitative_definition_only | definition_found | definition_found |
| Santa Clarita Transit | United States | California | medium | bus | static_scheduled | United States / no_definition_found | not_reviewed | not_reviewed |
| CityBus of Greater Lafayette | United States | Indiana | medium | bus | static_scheduled | United States / definition_found | definition_found | not_found |
| NFTA (Buffalo) | United States | New York | large | bus | static_scheduled | United States / qualitative_definition_only | definition_found | not_found |
| Charleston Area Regional Transportation Authority (CARTA) | United States | South Carolina | medium | mixed | static_scheduled | United States / no_definition_found | definition_found | definition_found |
| Bustang Outrider | United States | Colorado | small | bus | static_scheduled | United States / definition_found | not_reviewed | not_reviewed |
| Indian River Transit | United States | Florida | medium | bus | static_scheduled | United States / qualitative_definition_only | not_reviewed | not_reviewed |
| Camarillo Area Transit | United States | California | small | bus | static_scheduled | United States / no_definition_found | not_reviewed | not_reviewed |
| Collier Area Transit (Naples) | United States | Florida | medium | bus | static_scheduled | United States / definition_found | definition_found | not_found |
| Clallam Transit System | United States | Washington | small | bus | static_scheduled | United States / qualitative_definition_only | definition_found | not_found |
| Grand Valley Transit | United States | Colorado | small | bus | static_scheduled | United States / no_definition_found | not_reviewed | not_reviewed |
| Ben Franklin Transit (Tri-Cities, WA) | United States | Washington | medium | bus | static_scheduled | United States / definition_found | definition_found | not_found |
| TAC (Charleville) | France | Grand Est | medium | bus | static_scheduled | France / no_definition_found | not_reviewed | not_reviewed |
| RTM (Marseille) | France | Provence-Alpes-Côte d'Azur | large | bus | static_scheduled | France / qualitative_definition_only | not_reviewed | not_reviewed |
| Vitalis (Poitiers) | France | Nouvelle-Aquitaine | large | bus | static_scheduled | France / definition_found | not_reviewed | not_reviewed |
| TIC (Compiègne) | France | Hauts-de-France | small | bus | static_scheduled | France / no_definition_found | not_reviewed | not_reviewed |
| Twisto (Caen) | France | Normandie | medium | bus | static_scheduled | France / qualitative_definition_only | not_reviewed | not_reviewed |
| Trace (Colmar) | France | Grand Est | medium | bus | static_scheduled | France / definition_found | definition_found | not_found |
| Vesoul | France | Bourgogne-Franche-Comté | unknown | bus | static_scheduled | France / no_definition_found | not_reviewed | not_reviewed |
| Bibus (Brest) | France | Bretagne | medium | bus | static_scheduled | France / qualitative_definition_only | not_reviewed | not_reviewed |
| Fil Bleu (Tours) | France | Centre-Val de Loire | medium | bus | static_scheduled | France / definition_found | not_reviewed | not_reviewed |
| Laon urbain | France | Hauts-de-France | small | bus | static_scheduled | France / no_definition_found | not_reviewed | not_reviewed |
| Saumur Agglobus | France | Pays de la Loire | medium | bus | static_scheduled | France / qualitative_definition_only | not_reviewed | not_reviewed |
| Yélo (La Rochelle) | France | Nouvelle-Aquitaine | medium | bus | static_scheduled | France / definition_found | not_reviewed | not_reviewed |
| Zest (Menton) | France | Provence-Alpes-Côte d'Azur | unknown | bus | static_scheduled | France / no_definition_found | not_reviewed | not_reviewed |
| Soléa (Mulhouse) | France | Grand Est | medium | bus | static_scheduled | France / qualitative_definition_only | not_reviewed | not_reviewed |
| Idelis (Pau) | France | Nouvelle-Aquitaine | medium | bus | static_scheduled | France / definition_found | not_reviewed | not_reviewed |
| Mistral (Toulon) | France | Provence-Alpes-Côte d'Azur | medium | bus | static_scheduled | France / no_definition_found | not_reviewed | not_reviewed |
| TCL (Lyon) | France | Auvergne-Rhône-Alpes | large | bus | static_scheduled | France / qualitative_definition_only | not_found | not_found |
| TBM (Bordeaux) | France | Nouvelle-Aquitaine | large | bus | static_scheduled | France / definition_found | not_reviewed | not_reviewed |
| TUL (Laval) | France | Pays de la Loire | medium | bus | static_scheduled | France / no_definition_found | not_reviewed | not_reviewed |
| TAG (Grenoble) | France | Auvergne-Rhône-Alpes | large | bus | static_scheduled | France / qualitative_definition_only | not_reviewed | not_reviewed |

## Research ledger

The structured ledger is [agency-lateness-policy-study-2026-09.json](agency-lateness-policy-study-2026-09.json). The official-source review must replace each `not_reviewed` status with `definition_found`, `not_found`, or `inaccessible` and add source-backed notes.
