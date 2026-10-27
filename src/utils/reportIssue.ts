const ATLAS_FEEDBACK_EMAIL = 'hey@ryanisnota.pro';
const ATLAS_ISSUE_URL = 'https://github.com/Civic-Minds/Atlas/issues/new';
const MAX_MAILTO_LENGTH = 18_000;

export interface IssueReportContext {
  reasons: string[];
  frequencyReasons: string[];
  description: string;
}

export function currentAtlasUrl(): string {
  return window.location.href;
}

/** One line of a report's details: a labelled field ("**Agency:** TTC") or a line as written (a list item, a blank line). */
export type ReportDetailLine = readonly [label: string, value: string] | string;

/**
 * Every card's report details in one format (CIV-999): each field on its own line as "**Label:** value",
 * other lines as written, and the Atlas URL last, so every report ends with the link to what was on screen.
 */
export function reportDetails(lines: readonly ReportDetailLine[], url: string = currentAtlasUrl()): string {
  return [
    ...lines.map(line => (typeof line === 'string' ? line : `**${line[0]}:** ${line[1]}`)),
    `**Atlas URL:** ${url}`,
  ].join('\n');
}

export function openAtlasFeedbackEmail(subject: string, body: string): void {
  const encodedSubject = encodeURIComponent(subject);
  const fullMailto = `mailto:${ATLAS_FEEDBACK_EMAIL}?subject=${encodedSubject}&body=${encodeURIComponent(body)}`;
  let mailto = fullMailto;

  // Email clients and browsers impose URI-length limits. Keep the draft usable while
  // preserving the complete captured details on the clipboard when the report is large.
  if (fullMailto.length > MAX_MAILTO_LENGTH) {
    void navigator.clipboard?.writeText(body);
    const shortenedBody = `${body.slice(0, 10_000)}\n\n[The full captured details were copied to your clipboard because this email draft was too large.]`;
    mailto = `mailto:${ATLAS_FEEDBACK_EMAIL}?subject=${encodedSubject}&body=${encodeURIComponent(shortenedBody)}`;
  }

  window.location.href = mailto;
}

export function openAtlasProblemDestination(subject: string, body: string): void {
  if (import.meta.env.DEV) {
    const fullIssueUrl = `${ATLAS_ISSUE_URL}?${new URLSearchParams({ title: subject, body, labels: 'user-reported' }).toString()}`;
    if (fullIssueUrl.length > MAX_MAILTO_LENGTH) {
      void navigator.clipboard?.writeText(body);
      const shortenedBody = `${body.slice(0, 10_000)}\n\n[The full captured details were copied to your clipboard because this issue draft was too large.]`;
      const params = new URLSearchParams({ title: subject, body: shortenedBody, labels: 'user-reported' });
      window.open(`${ATLAS_ISSUE_URL}?${params.toString()}`, '_blank', 'noopener,noreferrer');
      return;
    }
    const params = new URLSearchParams({ title: subject, body, labels: 'user-reported' });
    window.open(`${ATLAS_ISSUE_URL}?${params.toString()}`, '_blank', 'noopener,noreferrer');
    return;
  }
  openAtlasFeedbackEmail(subject, body);
}

export function openAtlasProblemEmail(title: string, details: string, context: IssueReportContext): void {
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
  openAtlasProblemDestination(`Atlas report: ${title}`, body);
}
