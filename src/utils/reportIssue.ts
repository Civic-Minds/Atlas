const ATLAS_ISSUE_URL = 'https://github.com/Civic-Minds/Atlas/issues/new';

export interface IssueReportContext {
  reasons: string[];
  frequencyReasons: string[];
  description: string;
}

export function currentAtlasUrl(): string {
  return window.location.href;
}

export function openAtlasIssueReport(title: string, details: string, context: IssueReportContext): void {
  const plainDetails = details
    .replace(/\*\*/g, '')
    .replace(/^```(?:json)?\s*$/gm, '');
  const reportSection = [
    '**Reported reasons:**',
    ...(context.reasons.length > 0 ? context.reasons.map(reason => `- ${reason}`) : ['- None selected']),
    ...(context.frequencyReasons.length > 0 ? ['', '**Frequency details:**', ...context.frequencyReasons.map(reason => `- ${reason}`)] : []),
    '',
    "**What's wrong:**",
    context.description.trim(),
  ].join('\n');
  const body = `${plainDetails}\n\nDIAGNOSTICS ABOVE — PLEASE DO NOT EDIT\n\n${reportSection}\n`;
  const diagnosticsMarkers = [
    '\nGenerated route metrics from the loaded artifact:',
    '\nGenerated route metrics (loaded artifact):',
  ];
  const diagnosticsStart = diagnosticsMarkers
    .map(marker => body.indexOf(marker))
    .find(index => index !== -1) ?? -1;
  const issueBody = diagnosticsStart === -1
    ? body
    : `${reportSection}\n\nFull route diagnostics copied to your clipboard. Paste them below this report.`;

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
