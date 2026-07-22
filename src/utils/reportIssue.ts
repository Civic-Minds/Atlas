const ATLAS_ISSUE_URL = 'https://github.com/Civic-Minds/Atlas/issues/new';

export function currentAtlasUrl(): string {
  return window.location.href;
}

export function openAtlasIssueReport(title: string, details: string): void {
  const body = `${details}\n\n**What's wrong:**\n\n**Expected:**\n\n**Actual:**\n`;
  const params = new URLSearchParams({
    title,
    body,
    labels: 'user-reported',
  });
  window.open(`${ATLAS_ISSUE_URL}?${params.toString()}`, '_blank', 'noopener,noreferrer');
}
