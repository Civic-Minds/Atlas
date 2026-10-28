export function privacyRegionResponse(request: Request): Response {
  const country = (
    request.headers.get('x-vercel-ip-country')
    || request.headers.get('cf-ipcountry')
    || 'XX'
  ).toUpperCase();

  return Response.json(
    { country: /^[A-Z]{2}$/.test(country) ? country : 'XX' },
    // The visitor's own browser may keep it a day (CIV-977): repeat visits skip the function. Never a shared cache.
    { headers: { 'Cache-Control': 'private, max-age=86400' } },
  );
}
