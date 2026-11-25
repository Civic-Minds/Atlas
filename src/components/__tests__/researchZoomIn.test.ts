import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ZOOM_IN_TO_SEE_ROUTES, ZOOMED_OUT_NOTICE } from '../../content/noticeCopy';

// #1817 (Ryan, 2026-11-25: "1"): zoomed out, the overnight and frequent-service views draw no route at all, so they say to
// zoom in, from one shared line, never the frequency map's "Some less frequent routes are hidden".
const read = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8');

describe('research views zoomed out (#1817)', () => {
  it('has the approved words', () => expect(ZOOM_IN_TO_SEE_ROUTES).toBe('Zoom in to see the routes.'));
  it('the overnight list says to zoom in, not the frequency map notice', () => {
    const night = read('apps/NightService.tsx');
    expect(night).toMatch(/zoomedOut \? ZOOM_IN_TO_SEE_ROUTES/);
    expect(night).not.toContain('ZOOMED_OUT_NOTICE');
  });
  it('the frequent-service view shows the same line under its info card', () => {
    expect(read('App.tsx')).toMatch(/FREQUENT_INFO_HEADING[^\n]*below=\{<ResearchZoomInCard /);
    expect(read('components/ResearchInfo.tsx')).toMatch(/<PanelEmpty>\{ZOOM_IN_TO_SEE_ROUTES\}<\/PanelEmpty>/);
  });
  it('keeps the frequency map export note as it was', () => expect(ZOOMED_OUT_NOTICE).toBe('Zoomed out. Some less frequent routes are hidden.'));
});
