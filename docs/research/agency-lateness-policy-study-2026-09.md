# Agency lateness and headway policy study

- Study version: `2026-09-26.v1`
- Sample seed: `20260926`
- Sample: 80 agencies — Canada 20, United States 40, France 20
- Scope: schedule punctuality and headway/frequency reliability, recorded separately
- Status: sample initialized; 7 agency schedule-policy records have verified official sources

## Method

This exploratory study records how agencies themselves define lateness, on-time performance, acceptable headway, bunching, and service reliability. It does not treat an agency frequency promise as an on-time rule, and it does not change Atlas production logic.

Each agency must end with either an official definition, an explicit no-definition-found result, or an inaccessible-source result. Sources must include a URL, title, publisher, access date, and page or section when applicable.

## Atlas baseline

The current pipeline baseline is a minimum 5-minute grace, a 15% grace component, up to 2 grace violations, and a 30% violation allowance. This study evaluates that baseline; it does not alter it.

## Initial verified findings

- Niagara uses −1/+5 minutes at published timing points with a 90% target; Greater Sudbury uses no early departures and no more than 3 minutes late with a 90% target.
- GO Transit uses a 5-minute terminal-arrival window for journeys under 90 minutes and 10 minutes for longer journeys.
- RTD-Denver uses less than 1 minute early or up to 5 minutes late for bus and rail.
- COTA defines a late arrival as 5 minutes or more after schedule.
- NFTA publishes different official windows across documents and modes; the study records that discrepancy instead of flattening it.
- LADOT publishes an 85% on-time performance target but no minute-based late-trip window in the reviewed source.

## Sample

| Agency | Country | Region | Size | Mode | Selection stratum | Schedule policy | Headway policy |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Niagara Transit | Canada | Ontario | medium | bus | Canada / definition_found | definition_found | not_reviewed |
| Greater Sudbury Transit | Canada | Ontario | medium | bus | Canada / qualitative_definition_only | definition_found | not_reviewed |
| STL (Laval) | Canada | Quebec | large | bus | Canada / no_definition_found | not_reviewed | not_reviewed |
| Burlington Transit | Canada | Ontario | medium | bus | Canada / definition_found | not_reviewed | not_reviewed |
| Red Deer Transit | Canada | Alberta | medium | bus | Canada / qualitative_definition_only | not_reviewed | not_reviewed |
| Owen Sound Transit | Canada | Ontario | small | bus | Canada / no_definition_found | not_reviewed | not_reviewed |
| Guelph Transit | Canada | Ontario | medium | bus | Canada / definition_found | not_reviewed | not_reviewed |
| Barrie Transit | Canada | Ontario | medium | bus | Canada / qualitative_definition_only | not_reviewed | not_reviewed |
| St. Thomas Transit | Canada | Ontario | small | bus | Canada / no_definition_found | not_reviewed | not_reviewed |
| Grand River Transit (Waterloo Region) | Canada | Ontario | large | bus | Canada / definition_found | not_reviewed | not_reviewed |
| BC Transit (Comox Valley) | Canada | British Columbia | small | bus | Canada / qualitative_definition_only | not_reviewed | not_reviewed |
| Ville de Saint-Hyacinthe | Canada | Quebec | small | bus | Canada / no_definition_found | not_reviewed | not_reviewed |
| UP Express (Toronto) | Canada | Ontario | small | bus | Canada / definition_found | not_reviewed | not_reviewed |
| BC Transit (Kelowna) | Canada | British Columbia | medium | bus | Canada / qualitative_definition_only | not_reviewed | not_reviewed |
| MiWay (Mississauga) | Canada | Ontario | large | bus | Canada / no_definition_found | not_reviewed | not_reviewed |
| Metrobus (St. John's) | Canada | Newfoundland | medium | rail | Canada / definition_found | not_reviewed | not_reviewed |
| RTL (Longueuil) | Canada | Quebec | large | bus | Canada / qualitative_definition_only | not_reviewed | not_reviewed |
| Moose Jaw Transit | Canada | Saskatchewan | small | bus | Canada / no_definition_found | not_reviewed | not_reviewed |
| GO Transit | Canada | Ontario | medium | mixed | Canada / definition_found | definition_found | not_reviewed |
| Cornwall Transit | Canada | Ontario | small | bus | Canada / qualitative_definition_only | not_reviewed | not_reviewed |
| Bloomington Transit | United States | Indiana | medium | bus | United States / definition_found | not_reviewed | not_reviewed |
| Santa Rosa CityBus | United States | California | unknown | bus | United States / qualitative_definition_only | not_reviewed | not_reviewed |
| SunLine Transit Agency (Coachella Valley) | United States | California | medium | bus | United States / no_definition_found | not_reviewed | not_reviewed |
| Central Ohio Transit Authority (COTA) | United States | Ohio | large | mixed | United States / definition_found | definition_found | not_reviewed |
| Long Beach Transit | United States | California | medium | bus | United States / qualitative_definition_only | not_reviewed | not_reviewed |
| Capital Area Transit System (Baton Rouge) | United States | Louisiana | medium | bus | United States / no_definition_found | not_reviewed | not_reviewed |
| Butler County Regional Transit Authority | United States | Ohio | medium | mixed | United States / definition_found | not_reviewed | not_reviewed |
| Los Angeles Department of Transportation (LADOT/DASH) | United States | California | large | bus | United States / qualitative_definition_only | definition_found | not_reviewed |
| Ventura County Transportation Commission (VCTC Intercity) | United States | California | small | mixed | United States / no_definition_found | not_reviewed | not_reviewed |
| Westchester County Bee-Line System (BeeLine) | United States | New York | unknown | bus | United States / definition_found | not_reviewed | not_reviewed |
| Capital Transit (Juneau) | United States | Alaska | small | bus | United States / qualitative_definition_only | not_reviewed | not_reviewed |
| Blue Water Area Transit (Port Huron) | United States | Michigan | small | bus | United States / no_definition_found | not_reviewed | not_reviewed |
| Hillsborough Area Regional Transit (HART) | United States | Florida | medium | mixed | United States / definition_found | not_reviewed | not_reviewed |
| Jefferson Transit | United States | Washington | small | bus | United States / qualitative_definition_only | not_reviewed | not_reviewed |
| Laguna Beach Transit | United States | California | small | bus | United States / no_definition_found | not_reviewed | not_reviewed |
| Augusta Transit | United States | Georgia | unknown | bus | United States / definition_found | not_reviewed | not_reviewed |
| Blacksburg Transit | United States | Virginia | small | bus | United States / qualitative_definition_only | not_reviewed | not_reviewed |
| City of Bowling Green | United States | — | small | bus | United States / no_definition_found | not_reviewed | not_reviewed |
| Durango Transit | United States | Colorado | small | mixed | United States / definition_found | not_reviewed | not_reviewed |
| Kitsap Transit | United States | Washington | medium | bus | United States / qualitative_definition_only | not_reviewed | not_reviewed |
| Chemung County C-TRAN | United States | New York | small | bus | United States / no_definition_found | not_reviewed | not_reviewed |
| Pierce Transit | United States | Washington | medium | bus | United States / definition_found | not_reviewed | not_reviewed |
| Palos Verdes Peninsula Transit Authority (PVPTA) | United States | California | small | mixed | United States / qualitative_definition_only | not_reviewed | not_reviewed |
| WestCAT (Pinole) | United States | California | small | bus | United States / no_definition_found | not_reviewed | not_reviewed |
| Everett Transit | United States | Washington | medium | bus | United States / definition_found | not_reviewed | not_reviewed |
| Regional Transportation District (RTD Denver) | United States | Colorado | large | mixed | United States / qualitative_definition_only | definition_found | not_reviewed |
| Kalamazoo Metro Transit | United States | Michigan | medium | rail | United States / no_definition_found | not_reviewed | not_reviewed |
| Tompkins Consolidated Area Transit | United States | New York | medium | bus | United States / definition_found | not_reviewed | not_reviewed |
| Antelope Valley Transit Authority (AVTA) | United States | California | medium | mixed | United States / qualitative_definition_only | not_reviewed | not_reviewed |
| Santa Clarita Transit | United States | California | medium | bus | United States / no_definition_found | not_reviewed | not_reviewed |
| CityBus of Greater Lafayette | United States | Indiana | medium | bus | United States / definition_found | not_reviewed | not_reviewed |
| NFTA (Buffalo) | United States | New York | large | bus | United States / qualitative_definition_only | definition_found | not_reviewed |
| Charleston Area Regional Transportation Authority (CARTA) | United States | South Carolina | medium | mixed | United States / no_definition_found | not_reviewed | not_reviewed |
| Bustang Outrider | United States | Colorado | small | bus | United States / definition_found | not_reviewed | not_reviewed |
| Indian River Transit | United States | Florida | medium | bus | United States / qualitative_definition_only | not_reviewed | not_reviewed |
| Camarillo Area Transit | United States | California | small | bus | United States / no_definition_found | not_reviewed | not_reviewed |
| Collier Area Transit (Naples) | United States | Florida | medium | bus | United States / definition_found | not_reviewed | not_reviewed |
| Clallam Transit System | United States | Washington | small | bus | United States / qualitative_definition_only | not_reviewed | not_reviewed |
| Grand Valley Transit | United States | Colorado | small | bus | United States / no_definition_found | not_reviewed | not_reviewed |
| Ben Franklin Transit (Tri-Cities, WA) | United States | Washington | medium | bus | United States / definition_found | not_reviewed | not_reviewed |
| TAC (Charleville) | France | Grand Est | medium | bus | France / no_definition_found | not_reviewed | not_reviewed |
| RTM (Marseille) | France | Provence-Alpes-Côte d'Azur | large | bus | France / qualitative_definition_only | not_reviewed | not_reviewed |
| Vitalis (Poitiers) | France | Nouvelle-Aquitaine | large | bus | France / definition_found | not_reviewed | not_reviewed |
| TIC (Compiègne) | France | Hauts-de-France | small | bus | France / no_definition_found | not_reviewed | not_reviewed |
| Twisto (Caen) | France | Normandie | medium | bus | France / qualitative_definition_only | not_reviewed | not_reviewed |
| Trace (Colmar) | France | Grand Est | medium | bus | France / definition_found | not_reviewed | not_reviewed |
| Vesoul | France | Bourgogne-Franche-Comté | unknown | bus | France / no_definition_found | not_reviewed | not_reviewed |
| Bibus (Brest) | France | Bretagne | medium | bus | France / qualitative_definition_only | not_reviewed | not_reviewed |
| Fil Bleu (Tours) | France | Centre-Val de Loire | medium | bus | France / definition_found | not_reviewed | not_reviewed |
| Laon urbain | France | Hauts-de-France | small | bus | France / no_definition_found | not_reviewed | not_reviewed |
| Saumur Agglobus | France | Pays de la Loire | medium | bus | France / qualitative_definition_only | not_reviewed | not_reviewed |
| Yélo (La Rochelle) | France | Nouvelle-Aquitaine | medium | bus | France / definition_found | not_reviewed | not_reviewed |
| Zest (Menton) | France | Provence-Alpes-Côte d'Azur | unknown | bus | France / no_definition_found | not_reviewed | not_reviewed |
| Soléa (Mulhouse) | France | Grand Est | medium | bus | France / qualitative_definition_only | not_reviewed | not_reviewed |
| Idelis (Pau) | France | Nouvelle-Aquitaine | medium | bus | France / definition_found | not_reviewed | not_reviewed |
| Mistral (Toulon) | France | Provence-Alpes-Côte d'Azur | medium | bus | France / no_definition_found | not_reviewed | not_reviewed |
| TCL (Lyon) | France | Auvergne-Rhône-Alpes | large | bus | France / qualitative_definition_only | not_reviewed | not_reviewed |
| TBM (Bordeaux) | France | Nouvelle-Aquitaine | large | bus | France / definition_found | not_reviewed | not_reviewed |
| TUL (Laval) | France | Pays de la Loire | medium | bus | France / no_definition_found | not_reviewed | not_reviewed |
| TAG (Grenoble) | France | Auvergne-Rhône-Alpes | large | bus | France / qualitative_definition_only | not_reviewed | not_reviewed |

## Research ledger

The structured ledger is [agency-lateness-policy-study-2026-09.json](agency-lateness-policy-study-2026-09.json). The official-source review must replace each `not_reviewed` status with `definition_found`, `not_found`, or `inaccessible` and add source-backed notes.
