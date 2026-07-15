#!/usr/bin/env npx tsx
/** Record a completed feed review and update the agency's public review status. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readFeedReviewHistory, shouldReviewNextFeed, writeFeedReviewHistory, type FeedReviewResult } from '../pipeline/feedReview.js';

const [slug, resultArg, feedKey, issueUrl] = process.argv.slice(2);
const result = resultArg as FeedReviewResult;
if (!slug || !['clean', 'issue'].includes(result) || !feedKey) {
  console.error('Usage: npm run record-feed-review -- <slug> <clean|issue> <feed-expiry-or-version> [issue-url]');
  process.exit(1);
}

const root = resolve('.');
const history = readFeedReviewHistory(root);
const records = history.agencies[slug] ?? [];
records.push({
  feedExpiry: /^\d{8}$/.test(feedKey) ? feedKey : null,
  feedVersion: /^\d{8}$/.test(feedKey) ? null : feedKey,
  result,
  ...(issueUrl ? { issueUrl } : {}),
  reviewedAt: new Date().toISOString().slice(0, 10),
});
history.agencies[slug] = records.slice(-10);
writeFeedReviewHistory(history, root);

const sourcePath = resolve(root, 'config/agencies', `${slug}.json`);
if (!existsSync(sourcePath)) throw new Error(`Unknown agency source: ${slug}`);
const agency = JSON.parse(readFileSync(sourcePath, 'utf8')) as Record<string, unknown>;
delete agency.feedReviewStatus;
if (result === 'issue') {
  if (issueUrl) agency.issueUrl = issueUrl;
} else if (shouldReviewNextFeed(records)) {
  // A clean review does not permanently change the agency's risk history;
  // it only clears the warning for this verified snapshot.
  agency.feedReviewStatus = 'verified';
}
writeFileSync(sourcePath, `${JSON.stringify(agency, null, 2)}\n`);

console.log(`${slug}: recorded ${result}; ${records.filter(r => r.result === 'issue').length}/${records.length} recent feeds flagged`);
