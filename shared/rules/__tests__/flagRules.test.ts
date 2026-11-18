import { describe, expect, it } from 'vitest';
import { featuresForEnv } from '../../../scripts/featureFlags';
import { FEATURE_ROUTES } from '../../config';
import { historyV2Enabled } from '../../../pipeline/historyV2Flag';

/**
 * Rules audit move 10: what each build switches on, pinned per mode, so moving the switches into shared/rules/flags.ts
 * is proven to change nothing. Runs shared/config.ts with each env as Vite would (scripts/featureFlags.ts).
 */
const ROOT = new URL('../../..', import.meta.url).pathname;
const ALL = ['agencyHoursBar', 'beta', 'cardClickToFlag', 'collapseModeTabs', 'connectionsBar', 'contextLayer', 'dataSourceLink', 'feedQuality', 'frequentService', 'history', 'historyDayPicker', 'live', 'liveReports', 'mapContext', 'matchPercentage', 'modeTransitions', 'onDemand', 'outdatedFilter', 'persistedSettings', 'plannersLink', 'preview', 'researchApps', 'researchersLink', 'routeVariants', 'runningTimes', 'segmentColours', 'shareUtm', 'sparklineExpand', 'studio', 'unevenBanner', 'updateBanner', 'whatsNewBetaItems'];
const CASES: Record<string, { env: Record<string, string | boolean>; mode: string; on: string[] }> = {
    public: { env: { VITE_ATLAS_MODE: 'public' }, mode: 'public', on: ['modeTransitions'] },
    preview: { env: { VITE_ATLAS_MODE: 'preview' }, mode: 'preview', on: ['beta', 'feedQuality', 'mapContext', 'matchPercentage', 'modeTransitions', 'onDemand', 'outdatedFilter', 'persistedSettings', 'preview', 'routeVariants', 'runningTimes', 'sparklineExpand', 'updateBanner', 'whatsNewBetaItems'] },
    beta: { env: { VITE_ATLAS_MODE: 'beta', VITE_HISTORY_ENABLED: 'true', VITE_LIVE_REPORTS_ENABLED: 'true' }, mode: 'beta', on: ['beta', 'collapseModeTabs', 'feedQuality', 'frequentService', 'history', 'liveReports', 'mapContext', 'matchPercentage', 'modeTransitions', 'onDemand', 'outdatedFilter', 'persistedSettings', 'researchApps', 'routeVariants', 'runningTimes', 'segmentColours', 'shareUtm', 'sparklineExpand', 'updateBanner', 'whatsNewBetaItems'] },
    dev: { env: { VITE_ATLAS_MODE: 'dev', DEV: true, VITE_LIVE_ENABLED: 'true', VITE_HISTORY_ENABLED: 'true', VITE_HISTORY_DAY_PICKER_ENABLED: 'true', VITE_CARD_CLICK_TO_FLAG_ENABLED: 'true', VITE_UNEVEN_BANNER_ENABLED: 'true' }, mode: 'dev', on: ['agencyHoursBar', 'beta', 'cardClickToFlag', 'collapseModeTabs', 'connectionsBar', 'contextLayer', 'feedQuality', 'frequentService', 'history', 'historyDayPicker', 'live', 'liveReports', 'mapContext', 'matchPercentage', 'modeTransitions', 'onDemand', 'outdatedFilter', 'persistedSettings', 'plannersLink', 'researchApps', 'researchersLink', 'routeVariants', 'runningTimes', 'segmentColours', 'shareUtm', 'sparklineExpand', 'studio', 'unevenBanner', 'updateBanner', 'whatsNewBetaItems'] },
    legacyBeta: { env: { VITE_BETA_BUILD: 'true' }, mode: 'beta', on: ['beta', 'collapseModeTabs', 'feedQuality', 'frequentService', 'mapContext', 'matchPercentage', 'modeTransitions', 'onDemand', 'outdatedFilter', 'persistedSettings', 'researchApps', 'routeVariants', 'runningTimes', 'segmentColours', 'shareUtm', 'sparklineExpand', 'updateBanner', 'whatsNewBetaItems'] },
    legacyPreview: { env: { VITE_PREVIEW_BUILD: 'true' }, mode: 'preview', on: ['beta', 'feedQuality', 'mapContext', 'matchPercentage', 'modeTransitions', 'onDemand', 'outdatedFilter', 'persistedSettings', 'preview', 'routeVariants', 'runningTimes', 'sparklineExpand', 'updateBanner', 'whatsNewBetaItems'] },
    none: { env: {}, mode: 'public', on: ['modeTransitions'] },
};

describe('feature switches per build (rules audit move 10)', () => {
  for (const [name, c] of Object.entries(CASES)) it(`keeps the ${name} build's mode and switches`, async () => {
    const { mode, features } = await featuresForEnv(c.env, ROOT);
    expect(mode).toBe(c.mode);
    expect(Object.keys(features).sort()).toEqual(ALL);
    expect(Object.entries(features).filter(([, v]) => v).map(([k]) => k).sort()).toEqual(c.on);
  });

  it('keeps the feature routes', () => {
    expect(FEATURE_ROUTES).toEqual({
      research: '/research', studio: '/studio', studioVehicles: '/studio/vehicles', studioChanges: '/studio/changes',
      nightService: '/research/night', freeChildFares: '/research/free-child-fares', bustangConnections: '/research/bustang-connections',
      frequentService: { map: '/research/frequent-service', story: '/research/frequent-service/story' },
    });
  });

  it('turns History v2 on only for exactly "1"', () => {
    expect(['1', '0', 'true', '', undefined].map(historyV2Enabled)).toEqual([true, false, false, false, false]);
  });
});
