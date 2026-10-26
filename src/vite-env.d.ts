/// <reference types="vite/client" />

declare const __ATLAS_BUILD_ID__: string;

interface ImportMetaEnv {
  /** CARTO basemap key, public and locked to Atlas's hosts in CARTO's dashboard. */
  readonly VITE_CARTO_BASEMAP_KEY?: string;
}
