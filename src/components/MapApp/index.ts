/**
 * CIV-1732: the map-and-sidebar page, shared by Live's tool page and Studio so the two never drift. One page is:
 *
 *   <MapAppShell>                                   desktop only: a phone falls back to the map
 *     <MapAppHeader>logo, names, <MapPillGroup …/> (the views), PillMenu (route, time)</MapAppHeader>
 *     <MapAppLayout wide={useMapAppWide()} map={<MapAppMap layer={…} …/>} sidebar={<SidebarPanel widgets={…}/>}
 *       narrowPanels={…} overlay={<>{the key, one pill at the top left}<MapAppFooter note={…}/></>} />
 *   </MapAppShell>
 *
 * Every switcher sits in the one top bar (Ryan's option A, 2026-11-16).
 * The map takes either Live's stop-to-stop segments (`layer: { kind: 'segments', model, measure }`) or plain route lines
 * (`layer: { kind: 'lines', lines }`, each with its own colour, width, dash and opacity).
 */
export { MapAppShell, MapAppHeader } from './MapAppShell';
export { MapAppLayout, MAP_APP_PADDING, useMapAppWide } from './MapAppLayout';
export { default as MapAppMap, type MapLine, type MapPick } from './MapAppMap';
export { MapAppFooter, framePadding } from './MapAppFooter';
export { PillMenu, MapPillGroup } from './PillMenu';
export { default as SidebarPanel, type PanelWidget } from '../Live/tool/WidgetPanel';
export { default as SidebarWidget } from '../Live/tool/Widget';
