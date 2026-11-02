import { describe, expect, it } from 'vitest';
import { currentAgencyKey, currentAgencySlug } from '../formerSlugs';
import { parseAgencyCardParam, parseAgencyUrlRule, parseRouteChooserParam } from '../shareUrlState';
import { MAP_URL } from '../urlSchema';

// NJ Transit: njt-bus and njt-rail are one agency, njt; rail's route ids now carry "rail:" (config/agencies/njt.json).
describe('links made before an agency merge still open the same agency, route and stop', () => {
  it('maps old slugs; unknown slugs pass through', () => {
    expect(currentAgencySlug('njt-bus')).toBe('njt');
    expect(currentAgencySlug('njt-rail')).toBe('njt');
    expect(currentAgencySlug('ttc')).toBe('ttc');
  });

  it('a rail route key takes the rail prefix; a bus key and a stop key keep their ids', () => {
    expect(currentAgencyKey('njt-rail::5', true)).toBe('njt::rail:5');
    expect(currentAgencyKey('njt-rail::5::branch:x', true)).toBe('njt::rail:5::branch:x');
    expect(currentAgencyKey('njt-bus::5', true)).toBe('njt::5');
    expect(currentAgencyKey('njt-rail::148', false)).toBe('njt::148');
    expect(currentAgencyKey('ttc::5', true)).toBe('ttc::5');
  });

  it('the map reads old slugs in agencies=, operator=, routes=, route= and stop=', () => {
    expect(parseAgencyUrlRule('?agencies=njt-bus.njt-rail.septa')).toEqual({ kind: 'include', slugs: new Set(['njt', 'septa']) });
    expect(parseAgencyCardParam('?operator=njt-rail')).toBe('njt');
    expect(parseRouteChooserParam('?routes=njt-rail::5,njt-bus::87')).toEqual(['njt::rail:5', 'njt::87']);
    expect(MAP_URL.route.parse('njt-rail::5')).toBe('njt::rail:5');
    expect(MAP_URL.stop.parse('njt-bus::20883')).toBe('njt::20883');
  });
});
