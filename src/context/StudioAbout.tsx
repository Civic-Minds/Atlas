import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Agency } from '../App';

/**
 * What the About menu says inside Studio (CIV-1890): the same menu component as the main map, with Studio's own text. Studio
 * publishes the selected agency, whose schedule sources the menu lists.
 */
export interface StudioAbout {
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
