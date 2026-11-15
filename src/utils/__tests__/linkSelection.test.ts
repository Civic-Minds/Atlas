import { describe, expect, it } from 'vitest';
import { linkValueUnknown } from '../linkSelection';

const catalog = [{ slug: 'ttc' }, { slug: 'via-mobility' }];

describe('linkValueUnknown (#1191)', () => {
  it('a value with no agency or no id never opens a card, even before the catalog loads', () => {
    expect(linkValueUnknown('garbage', [], 'route')).toBe(true);
    expect(linkValueUnknown('garbage', [], 'stop')).toBe(true);
    expect(linkValueUnknown('ttc::', catalog, 'route')).toBe(true);
    expect(linkValueUnknown('TTC::504', catalog, 'route')).toBe(true);
    expect(linkValueUnknown('nope::', catalog, 'onDemand')).toBe(true);
  });

  it('an agency the catalog does not have never opens a card', () => {
    expect(linkValueUnknown('nope::5', catalog, 'route')).toBe(true);
    expect(linkValueUnknown('nope::5', catalog, 'stop')).toBe(true);
    expect(linkValueUnknown('nope', catalog, 'onDemand')).toBe(true);
    expect(linkValueUnknown('nope::zone', catalog, 'onDemand')).toBe(true);
  });

  it('waits for the catalog before judging a well-formed value', () => {
    expect(linkValueUnknown('nope::5', [], 'route')).toBeNull();
    expect(linkValueUnknown('nope', [], 'onDemand')).toBeNull();
  });

  it('a known agency is left to its data: the route, stop or zone may still be missing', () => {
    expect(linkValueUnknown('ttc::99999', catalog, 'route')).toBe(false);
    expect(linkValueUnknown('ttc::504::branch:a', catalog, 'route')).toBe(false);
    expect(linkValueUnknown('ttc::nope', catalog, 'stop')).toBe(false);
    expect(linkValueUnknown('via-mobility', catalog, 'onDemand')).toBe(false);
    expect(linkValueUnknown('via-mobility::zone-1', catalog, 'onDemand')).toBe(false);
  });
});
