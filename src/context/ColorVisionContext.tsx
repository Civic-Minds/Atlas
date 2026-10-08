import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

interface ColorVisionContextValue {
  colorVisionFriendly: boolean;
  setColorVisionFriendly: (value: boolean | ((previous: boolean) => boolean)) => void;
}

const DEFAULT_COLOR_VISION_CONTEXT: ColorVisionContextValue = {
  colorVisionFriendly: false,
  setColorVisionFriendly: () => {},
};

const ColorVisionContext = createContext<ColorVisionContextValue>(DEFAULT_COLOR_VISION_CONTEXT);

export function ColorVisionProvider({ children }: { children: ReactNode }) {
  const [colorVisionFriendly, setColorVisionFriendly] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('atlas_color_vision') === 'friendly';
  });

  useEffect(() => {
    localStorage.setItem('atlas_color_vision', colorVisionFriendly ? 'friendly' : 'default');
    document.documentElement.dataset.colorVision = colorVisionFriendly ? 'high-contrast' : 'normal';
  }, [colorVisionFriendly]);

  const value = useMemo(
    () => ({ colorVisionFriendly, setColorVisionFriendly }),
    [colorVisionFriendly]
  );

  return (
    <ColorVisionContext.Provider value={value}>
      {children}
    </ColorVisionContext.Provider>
  );
}

export function useColorVision() {
  return useContext(ColorVisionContext);
}
