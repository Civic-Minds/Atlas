/** Resolve a feed URL that needs a secret query parameter at runtime. */
export function resolveFeedUrl(
  url: string | null | undefined,
  apiKeyEnvVar?: string,
  apiKeyParam = 'api_key',
): string | null {
  if (!url) return null;
  if (!apiKeyEnvVar) return url;

  const apiKey = process.env[apiKeyEnvVar];
  if (!apiKey) throw new Error(`Missing ${apiKeyEnvVar} for feed URL`);

  const resolved = new URL(url);
  resolved.searchParams.set(apiKeyParam, apiKey);
  return resolved.toString();
}
