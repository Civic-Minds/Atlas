const deployments = [
  { name: 'public', mode: 'public', url: process.env.ATLAS_PUBLIC_URL ?? 'https://www.transitatlas.fyi' },
  { name: 'preview', mode: 'preview', url: process.env.ATLAS_PREVIEW_URL ?? 'https://preview.transitatlas.fyi' },
  { name: 'beta', mode: 'beta', url: process.env.ATLAS_BETA_URL ?? 'https://beta.transitatlas.fyi' },
];

let failed = false;

for (const deployment of deployments) {
  const base = deployment.url.replace(/\/$/, '');
  try {
    const page = await fetch(`${base}/?deployment-check=${Date.now()}`);
    const html = await page.text();
    if (!page.ok || !html.includes('Atlas')) {
      throw new Error(`app shell returned HTTP ${page.status}`);
    }

    const catalog = await fetch(`${base}/data/catalog-${deployment.mode}.json?deployment-check=${Date.now()}`);
    const contentType = catalog.headers.get('content-type') ?? '';
    const body = await catalog.text();
    if (!catalog.ok || !contentType.includes('application/json')) {
      throw new Error(`catalog returned HTTP ${catalog.status} as ${contentType || 'unknown content type'}`);
    }
    const payload = JSON.parse(body);
    if (!Array.isArray(payload.agencies)) {
      throw new Error('catalog does not contain an agencies array');
    }

    console.log(`PASS ${deployment.name}: ${payload.agencies.length} agencies in catalog-${deployment.mode}.json`);
  } catch (error) {
    failed = true;
    console.error(`FAIL ${deployment.name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failed) {
  console.error('Deployment verification failed. Check the Vercel project environment and deployment commit.');
  process.exit(1);
}
