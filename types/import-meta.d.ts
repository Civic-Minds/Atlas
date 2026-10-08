interface ImportMetaEnv {
  readonly DEV?: boolean;
  readonly VITE_R2_PUBLIC_URL?: string;
  readonly VITE_BETA_R2_PUBLIC_URL?: string;
  readonly VITE_LIVE_ENABLED?: string;
  readonly VITE_HISTORY_ENABLED?: string;
  readonly VITE_CORRIDORS_ENABLED?: string;
  readonly VITE_BETA_BUILD?: string;
  readonly VITE_PREVIEW_BUILD?: string;
  readonly VITE_CARD_CLICK_TO_FLAG_ENABLED?: string;
  readonly VITE_UNEVEN_BANNER_ENABLED?: string;
  readonly VITE_MAP_EXPORT_ENABLED?: string;
  readonly VITE_ATLAS_MODE?: string;
  readonly [key: string]: string | boolean | undefined;
}

interface ImportMeta {
  readonly env?: ImportMetaEnv;
}
