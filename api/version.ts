import { jsonResponse, type ApiResponse } from '../shared/http.js';

export default function handler(_req: unknown, res: ApiResponse): void {
  const buildId = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || null;
  jsonResponse(res, { buildId }, 200, { 'Cache-Control': 'no-store, max-age=0' });
}
