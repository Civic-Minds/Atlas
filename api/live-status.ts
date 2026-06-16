import { list } from '@vercel/blob';

export const config = { maxDuration: 30 };

export default async function handler(_req: Request) {
  try {
    const { blobs } = await list({ prefix: 'atlas/realtime/latest', limit: 5 });
    const latest = blobs.find(b => b.pathname === 'atlas/realtime/latest.json');

    if (!latest) {
      return new Response(JSON.stringify({ noData: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const res = await fetch(latest.url);
    if (!res.ok) throw new Error(`Blob fetch failed: ${res.status}`);

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=30',
      },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
