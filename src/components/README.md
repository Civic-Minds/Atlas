# Atlas UI primitives

Reuse these components before creating new panel markup or Tailwind class combinations.

## Surfaces and structure

- `../styles.ts` contains structural tokens such as `SURFACE`, `FLOATING_CARD`, `LIST_ROW`, `PANEL_BODY`, and the shared z-index values.
- Use `FLOATING_CARD` for map overlays and standalone floating panels.
- Use `PANEL_TITLE_BAR`, `PANEL_CARD_HEADER`, and `PANEL_BODY` for compact app panels that need a fixed header and scrolling content.

## Route and card content

- `Interval/cardUi.tsx` contains route-card primitives: `SidebarCardShell`, `SidebarCardHeaderBlock`, `SidebarCardList`, `SidebarCardListRows`, `CardDirectionRow`, `CardSummaryRow`, `CardSublineButton`, `CardSectionLabel`, and `CardHelpNotice`.
- `RouteCardTitle` is the shared agency eyebrow + route title treatment.
- `RouteListRow` is the shared route-list row for agency/search surfaces.

## Rules for new UI

1. Start with the closest existing shell and row primitive.
2. Keep the information hierarchy consistent: identity first, primary service/detail second, status or metadata third.
3. Add a primitive when a pattern appears in more than one surface; do not copy a long class string into another panel.
4. Keep product-specific behavior in the feature component. Keep reusable spacing, typography, borders, and interaction states in the primitive.
5. If a panel intentionally breaks the shared pattern, document why in the component rather than silently creating a parallel design.
