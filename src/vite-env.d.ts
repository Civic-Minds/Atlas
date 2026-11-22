/// <reference types="vite/client" />

declare const __ATLAS_BUILD_ID__: string;
/** Dev server only: this Mac's Atlas checkout and Node, for the MCP page's setup commands (empty in builds). */
declare const __ATLAS_MCP_LOCAL__: { checkout: string; node: string };

interface ImportMetaEnv {
  /** CARTO basemap key, public and locked to Atlas's hosts in CARTO's dashboard. */
  readonly VITE_CARTO_BASEMAP_KEY?: string;
}
