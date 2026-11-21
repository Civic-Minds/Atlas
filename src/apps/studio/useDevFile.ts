import { useEffect, useState } from 'react';

/** A file the Vite dev server serves (Studio's built files and agency lists): null while loading, 'missing' when absent. */
export function useDevFile<F>(url: string): F | null | 'missing' {
  const [file, setFile] = useState<F | null | 'missing'>(null);
  useEffect(() => {
    let live = true;
    const load = async (): Promise<F | 'missing'> => {
      try {
        const r = await fetch(url);
        return r.ok ? await r.json() as F : 'missing';
      } catch { return 'missing'; }
    };
    void load().then(f => { if (live) setFile(f); });
    return () => { live = false; };
  }, [url]);
  return file;
}
