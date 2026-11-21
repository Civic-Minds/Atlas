import { createContext, useContext, type ReactNode } from 'react';
import { FilterPanel } from '../../components/Interval/FilterPanel';

type Setter = (v: boolean | ((prev: boolean) => boolean)) => void;
/** App's general settings, the ones the main map's Settings menu shows (CIV-2006). */
export interface StudioGeneralSettings {
  lightMode: boolean; setLightMode: Setter;
  showMapLegend: boolean; setShowMapLegend: Setter;
  dataSaver: boolean; setDataSaver: Setter;
}

const Ctx = createContext<StudioGeneralSettings | null>(null);
export const StudioSettingsProvider = Ctx.Provider;

/**
 * CIV-2006 (Ryan chose option 1): Studio's Settings is the main app's Settings menu (FilterPanel), with the general
 * settings and, where the page has one, a Studio section (the planner cut-offs on Live). Nothing without App's settings.
 */
export function StudioSettingsGear({ section }: { section?: { title: string; content: ReactNode; active?: boolean } }) {
  const general = useContext(Ctx);
  if (!general) return null;
  return <FilterPanel {...general} extraSection={section} />;
}
