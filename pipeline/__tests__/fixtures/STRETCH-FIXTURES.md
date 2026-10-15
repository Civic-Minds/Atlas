# Stretch selector fixtures (frequency focus step 3)

Each folder is one route's trips on the services active on one date, cut from the stable zips in
`Atlas-worktrees/_feeds/` (`cut_fixture.py <zip> <out> <date> <route>`). Expected values in
`tripSets.test.ts` are the GTFS oracle's at the middle stop
(`scripts/handcheck/stretch-departures.py --at mid --tails`).

| Fixture | Source zip | Date | Route |
|---|---|---|---|
| ttc-507-weekday | `_feeds/_live-data/ttc.zip` (2026-10-14) | 2026-10-21 | 507 |
| ttc-134-weekday | same | 2026-10-21 | 134 |
| ttc-123-weekday | same | 2026-10-21 | 123 |
| ttc-102-weekday | same | 2026-10-21 | 102 |
| ttc-94-weekday | same | 2026-10-21 | 94 |
| ttc-505-weekday | same | 2026-10-21 | 505 |
| ttc-63-weekday | same | 2026-10-21 | 63 |
| ttc-25-weekday | same | 2026-10-21 | 25 |
| ttc-300-weekday-night | same | 2026-10-21 | 300 |
| cta-77-weekday | `_feeds/cta/20261130-fresh.zip` | 2026-10-21 | 77 |
| cta-87-weekday | `_feeds/cta/20261130-fresh.zip` | 2026-10-21 | 87 |
| nyct-subway-s-weekday | `_feeds/nyct-subway/20261031-fresh.zip` | 2026-10-21 | S (FS, GS, H) |
| septa-66-weekday | `_feeds/septa/20270220-fresh.zip` | 2026-10-21 | 66 |
| translink-044-weekday | `_feeds/translink/20270103-fresh.zip` | 2026-10-21 | 044 |
| ttc-63-saturday | same | 2026-10-17 | 63 |
| ttc-301-weekday-night | same | 2026-10-21 | 301 |
| ttc-320-weekday-night | same | 2026-10-21 | 320 |
| cta-36-saturday | `_feeds/cta/20261130-fresh.zip` | 2026-10-17 | 36 |
| lacmta-51-weekday | `_feeds/lacmta/20270401-fresh.zip` | 2026-10-21 | 51 |
| yrt-viva-weekday | `_feeds/yrt/20261031-fresh.zip` | 2026-10-21 | Viva blue, purple, orange, yellow |
| mbta-436-weekday | `_feeds/mbta/20261212-fresh.zip` | 2026-10-21 | 436 |

Where the middle-stop number differs from the spec's dispatch-end or hand value:

- TTC 102: with the steady-pattern gate (step 3 review), the Major Mackenzie branch (102D, 18% of
  trips, every 30 all day) is regular, so the route reads 30, range 5-30.
- TTC 29: neither direction has a tail on this feed (main stretches of 45 and 44 stops), so the
  route reads 8, not 16. The tail thresholds themselves are pinned on synthetic trips.
- MBTA 436 PM: the middle stop's full-window wait is 69 (dir 0), against step 2a's 57.
- TTC 63: the oracle counts both the arriving and the departing trip at Ossington (113 departures,
  median 2); the selector, like stopDepsByGroup, counts a chained trip's end once, as the next
  trip's departure.
