/** Dev server only: every area config (config/areas), for the page dev-data loaders. Never in a production build. */
import type { AreaConfig } from '../shared/areas';

export const DEV_AREA_CONFIGS: AreaConfig[] = Object.values(import.meta.glob('../config/areas/*.json', { eager: true, import: 'default' }) as Record<string, AreaConfig>);
