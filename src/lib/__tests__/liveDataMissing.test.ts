import { describe, expect, it } from 'vitest';
import { liveDataMissing } from '../liveReportData';

// #1922: the cloud reader answers 404 with only an error for an agency it has no recording of; that reads as missing,
// so the page says so in words instead of an empty box.
describe('liveDataMissing', () => {
  it('reads a 404 as missing and a good answer as present', () => {
    expect(liveDataMissing(new Response('{"error":"Live has no cloud recording for this agency."}', { status: 404 }))).toBe(true);
    expect(liveDataMissing(new Response('{}', { status: 200 }))).toBe(false);
  });
});
