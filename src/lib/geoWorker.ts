import { idbGet, idbSet } from './idbCache.js';

self.addEventListener('message', async (e: MessageEvent) => {
  const { type, slug, url, name, weekVer } = e.data;

  try {
    const idbKey = type === 'corridors' ? `${slug}-corridors-${weekVer}` : `${slug}-${weekVer}`;
    const cached = await idbGet<GeoJSON.FeatureCollection>(idbKey);

    if (cached) {
      self.postMessage({ slug, type, success: true, data: cached });
      return;
    }

    const r = await fetch(`${url}?v=${weekVer}`, { cache: 'default' });
    if (!r.ok) {
      throw new Error(`HTTP ${r.status}`);
    }

    const data = await r.json() as GeoJSON.FeatureCollection;

    for (const f of data.features) {
      const p = f.properties as Record<string, unknown> | null;
      if (p) {
        if (type === 'corridors') {
          p.agencySlug = slug;
        } else {
          p.agencyName = name;
        }
      }
    }

    await idbSet(idbKey, data);
    self.postMessage({ slug, type, success: true, data });
  } catch (err: any) {
    self.postMessage({ slug, type, success: false, error: err.message || String(err) });
  }
});
