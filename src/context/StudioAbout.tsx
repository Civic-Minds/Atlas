import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Agency } from '../App';

/**
 * What the About menu says inside Studio (CIV-1890): the same menu component as the main map, with Studio's own text. Studio
 * publishes the agencies each page has data for (from the Live and Fleet lists) and the one selected; the menu reads them.
 */
export interface StudioAbout {
  /** Each page's agencies, in that page's order. */
  live: readonly string[];
  fleet: readonly string[];
  /** The selected agency, from the catalog; null until the lists load. */
  agency: Agency | null;
}

interface Value { about: StudioAbout | null; setAbout: (a: StudioAbout | null) => void }
const Ctx = createContext<Value>({ about: null, setAbout: () => {} });

export function StudioAboutProvider({ children }: { children: ReactNode }) {
  const [about, setAbout] = useState<StudioAbout | null>(null);
  const value = useMemo(() => ({ about, setAbout }), [about]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useStudioAbout = () => useContext(Ctx);
