import { describe, expect, it } from 'vitest';
import { agencyEmptyMessage } from '../AgencyCard';
import { AGENCY_ROUTES_FAILED, NO_ROUTES_LOADED } from '../../../content/noticeCopy';
import { hiddenAgencyNoteFor } from '../../../../shared/hiddenAgencyNote';

const base = { activeFilterLabel: undefined, loadFailed: true, noServiceToday: false, day: 'weekday' };

describe('agencyEmptyMessage (CIV-1060)', () => {
  it('leaves out the load error on a hidden agency whose note explains it', () => {
    expect(agencyEmptyMessage({ ...base, hiddenNote: hiddenAgencyNoteFor('no-service-days') })).toBeNull();
    expect(agencyEmptyMessage({ ...base, hiddenNote: hiddenAgencyNoteFor('no-route-lines') })).toBeNull();
  });

  it('adds no second message to a hidden agency on any empty path (filter on, loaded with no routes, no service today)', () => {
    const hiddenNote = hiddenAgencyNoteFor('no-route-lines');
    expect(agencyEmptyMessage({ ...base, hiddenNote, activeFilterLabel: 'Frequent' })).toBeNull();
    expect(agencyEmptyMessage({ ...base, hiddenNote, loadFailed: false })).toBeNull();
    expect(agencyEmptyMessage({ ...base, hiddenNote, loadFailed: false, noServiceToday: true })).toBeNull();
  });

  it('keeps the load error for every other agency', () => {
    expect(agencyEmptyMessage({ ...base, hiddenNote: null })).toEqual({ text: AGENCY_ROUTES_FAILED, kind: 'error' });
  });

  it('keeps the other empty messages unchanged', () => {
    expect(agencyEmptyMessage({ ...base, loadFailed: false, hiddenNote: null })).toEqual({ text: NO_ROUTES_LOADED });
  });
});
