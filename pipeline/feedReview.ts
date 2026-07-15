import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type FeedReviewResult = 'clean' | 'issue';

export interface FeedReviewRecord {
  feedExpiry?: string | null;
  feedVersion?: string | null;
  result: FeedReviewResult;
  issueUrl?: string;
  reviewedAt?: string;
}

export interface FeedReviewHistory {
  version: 1;
  agencies: Record<string, FeedReviewRecord[]>;
}

export const FEED_REVIEW_WINDOW = 10;
export const FEED_REVIEW_ISSUE_THRESHOLD = 2;

export function shouldReviewNextFeed(records: FeedReviewRecord[]): boolean {
  if (records.length < 3) return false;
  const recent = records.slice(-FEED_REVIEW_WINDOW);
  return recent.filter(record => record.result === 'issue').length >= FEED_REVIEW_ISSUE_THRESHOLD;
}

export function feedReviewHistoryPath(root = resolve('.')): string {
  return resolve(root, 'config/feed-review-history.json');
}

export function readFeedReviewHistory(root = resolve('.')): FeedReviewHistory {
  const path = feedReviewHistoryPath(root);
  if (!existsSync(path)) return { version: 1, agencies: {} };
  return JSON.parse(readFileSync(path, 'utf8')) as FeedReviewHistory;
}

export function writeFeedReviewHistory(history: FeedReviewHistory, root = resolve('.')): void {
  writeFileSync(feedReviewHistoryPath(root), `${JSON.stringify(history, null, 2)}\n`);
}
