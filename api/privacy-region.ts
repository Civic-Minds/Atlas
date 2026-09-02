export default {
  async fetch(request: Request): Promise<Response> {
    const country = (request.headers.get('x-vercel-ip-country') || request.headers.get('cf-ipcountry') || 'XX').toUpperCase();
    return Response.json({ country: /^[A-Z]{2}$/.test(country) ? country : 'XX' }, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  },
};
