import * as maplibregl from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

// MapLibre 6 locates its worker at runtime via `new URL('./maplibre-gl-worker.mjs',
// import.meta.url)`, which bundlers can't see — production builds never emit the
// file, the SPA rewrite serves index.html instead, and no vector tiles render
// (same failure as #426). Hand it a Vite-bundled worker URL explicitly. Import this
// module before creating any map.
maplibregl.setWorkerUrl(maplibreWorkerUrl);
