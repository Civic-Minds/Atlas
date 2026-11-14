import { describe, expect, it } from 'vitest';
import { nameCase } from '../nameCase';

// CIV-1404 (Ryan "1"): on Live a station's bay or platform is named by the station alone; other names stay as they are.
describe('Live station names', () => {
  it('names a bay or platform by its station', () => {
    expect(nameCase('Broadview Station at Bay 6', 'liveStop')).toBe('Broadview Station');
    expect(nameCase('DUNDAS WEST STATION AT BAY 5', 'liveStop')).toBe('Dundas West Station');
    expect(nameCase('Dundas St West at Dundas West Outer Platform', 'liveStop')).toBe('Dundas West Station');
    expect(nameCase('Spadina Station Streetcar Platform', 'liveStop')).toBe('Spadina Station');
  });
  it('leaves street stops and stations without a bay as they are', () => {
    expect(nameCase('King St West at Yonge St West Side - King Station', 'liveStop')).toBe('King St West at Yonge St West Side - King Station');
    expect(nameCase('Queens Quay/Ferry Docks Station', 'liveStop')).toBe('Queens Quay/Ferry Docks Station');
    expect(nameCase('King St West at Bathurst St', 'liveStop')).toBe('King St West at Bathurst St');
    // A street called Bay, or a platform not at a station, is not a station's bay or platform.
    expect(nameCase('Union Station at Bay St', 'liveStop')).toBe('Union Station at Bay St');
    expect(nameCase('Main St at Eastbound Platform', 'liveStop')).toBe('Main St at Eastbound Platform');
    expect(nameCase('Queens Quay W at Spadina Ave East Side Streetcar Platform', 'liveStop')).toBe('Queens Quay W at Spadina Ave East Side Streetcar Platform');
    // The map's own mode keeps the full name.
    expect(nameCase('Broadview Station at Bay 6', 'stop')).toBe('Broadview Station at Bay 6');
  });
});
