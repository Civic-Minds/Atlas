const ATLAS_ISSUE_URL = 'https://github.com/Civic-Minds/Atlas/issues/new';

export function currentAtlasUrl(): string {
  return window.location.href;
}

export function openAtlasIssueReport(title: string, details: string): void {
  const plainDetails = details
    .replace(/\*\*/g, '')
    .replace(/^```(?:json)?\s*$/gm, '');
  const body = `${plainDetails}\n\nDIAGNOSTICS ABOVE — PLEASE DO NOT EDIT\n\nEXPECTED:\n\nACTUAL:\n\nWHAT'S WRONG:\n\n\n`;
  const diagnosticsMarker = '\nGenerated route metrics (loaded artifact):';
  const diagnosticsStart = body.indexOf(diagnosticsMarker);
  const issueBody = diagnosticsStart === -1
    ? body
    : 'Full route diagnostics copied to your clipboard. Select all with ⌘/Ctrl+A, then paste with ⌘/Ctrl+V.';

  // GitHub's issue composer is GET-based, so large raw route payloads exceed the
  // browser/request URL limit. Keep the auto-open body short and preserve the
  // complete diagnostic payload for one paste into the issue.
  if (diagnosticsStart !== -1) {
    void navigator.clipboard?.writeText(body);
  }
  const params = new URLSearchParams({
    title,
    body: issueBody,
    labels: 'user-reported',
  });
  window.open(`${ATLAS_ISSUE_URL}?${params.toString()}`, '_blank', 'noopener,noreferrer');
}
