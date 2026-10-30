import { describe, expect, it } from 'vitest';
import { shortStopName, stretchEnds } from '../stopLabel';

describe('shortStopName', () => {
  it('names the loop, not the street, for a stop at a loop', () => {
    expect(shortStopName('Humber Loop at the Queensway')).toBe('Humber Loop');
  });
  it('keeps the closing bracket around a station name', () => {
    expect(shortStopName("College St at University Ave (Queen's Park Station")).toBe("University Ave (Queen's Park Station)");
  });
  it('still picks the station or the cross street', () => {
    expect(shortStopName('Dundas St West at Yonge St - Dundas Station')).toBe('Dundas Station');
    expect(shortStopName('Queen St West at Bathurst St')).toBe('Bathurst St');
    expect(shortStopName('Spadina Ave at Queen St West North Side')).toBe('Queen St West');
  });
  // The Live strip's former copy (#1235).
  it('names the station for a stop at a bay or platform', () => {
    expect(shortStopName('Broadview Station at Bay 6')).toBe('Broadview Station');
    expect(shortStopName('Spadina Station Streetcar Platform')).toBe('Spadina Station');
    expect(shortStopName('Queens Quay Loop at Lower Spadina Ave')).toBe('Queens Quay Loop');
  });
  // #1235: the part after " - " was always kept, so SEPTA stops read "FS" and MARTA stations "BAY C".
  it('drops a stop detail after " - "', () => {
    expect(shortStopName('Roosevelt Blvd & Broad St - FS')).toBe('Roosevelt Blvd & Broad St');
    expect(shortStopName('Decatur Rd & Drummond Rd - MBNS')).toBe('Decatur Rd & Drummond Rd');
    expect(shortStopName('Broad St & Pattison Av - 2 NS')).toBe('Broad St & Pattison Av');
    expect(shortStopName('Whitman Plaza - 1')).toBe('Whitman Plaza');
    expect(shortStopName('Warden Station - Westbound Platform')).toBe('Warden Station');
  });
  // #1237: SEPTA and MBTA labels read only "MBNS 1", "north" or "Green Line".
  it('drops a direction, bay, route or line after " - "', () => {
    expect(shortStopName('Welsh Rd & Blair Mill Rd - MBNS 1')).toBe('Welsh Rd & Blair Mill Rd');
    expect(shortStopName('Decatur Rd & Comly Rd - MBNS Route 50')).toBe('Decatur Rd & Comly Rd');
    expect(shortStopName('52nd St & Market St - north')).toBe('52nd St & Market St');
    expect(shortStopName('Einstein Medical Ctr - south entrance')).toBe('Einstein Medical Ctr');
    expect(shortStopName('Chichester Av & Beeson Av - opposite')).toBe('Chichester Av & Beeson Av');
    expect(shortStopName('Olney Transit Center - Rts 22 80')).toBe('Olney Transit Center');
    expect(shortStopName('Olney Transit Center - B2 & B3')).toBe('Olney Transit Center');
    expect(shortStopName('Frankford Transit Center - Drop-off Only')).toBe('Frankford Transit Center');
    expect(shortStopName('Boston Ave @ College Ave - Green Line')).toBe('Boston Ave @ College Ave');
    expect(shortStopName('449 Mystic St - Winchester Line')).toBe('449 Mystic St');
    expect(shortStopName('400 Centre St - West')).toBe('400 Centre St');
    expect(shortStopName('Long Wharf (North) - Gate 5B')).toBe('Long Wharf (North)');
  });
  it('keeps a place after " - " that only starts like a detail', () => {
    expect(shortStopName('Beach St @ Shirley Ave - Bell Circle')).toBe('Bell Circle');
    expect(shortStopName('North Ave @ Chestnut St - Commuter Rail Station')).toBe('Commuter Rail Station');
    expect(shortStopName('Dundas St West - Bay St')).toBe('Bay St');
    expect(shortStopName('Main St - Route 66 Diner')).toBe('Route 66 Diner');
    expect(shortStopName('Pier Rd - Gate House')).toBe('Gate House');
  });
  it('keeps the station before " - "', () => {
    expect(shortStopName('INDIAN CREEK STATION - BAY C')).toBe('INDIAN CREEK STATION');
    expect(shortStopName('DECATUR STATION - CHURCH ST NB')).toBe('DECATUR STATION');
    expect(shortStopName('AIRPORT INTERNATIONAL TERMINAL - ARRIVALS')).toBe('AIRPORT INTERNATIONAL TERMINAL');
  });
  it('keeps the place after " - " otherwise', () => {
    expect(shortStopName('Bay St at Bloor St West - Bay Station')).toBe('Bay Station');
    expect(shortStopName('2395 Bayview Ave - Bob Rumball Centre For The Deaf')).toBe('Bob Rumball Centre For The Deaf');
    expect(shortStopName('Long Branch Loop - Long Branch GO Station')).toBe('Long Branch GO Station');
  });
  it('leaves a " - " inside brackets alone', () => {
    expect(shortStopName('MEMORIAL DR @ 5019 (GPTC - NORTH ENTRANCE)')).toBe('MEMORIAL DR @ 5019 (GPTC - NORTH ENTRANCE)');
  });
  it('keeps a street whose name has "Station" in it', () => {
    expect(shortStopName('Millwood Rd at Village Station Rd')).toBe('Village Station Rd');
    expect(shortStopName('Montgomery Av & Station Av')).toBe('Montgomery Av & Station Av');
  });
});

describe('stretchEnds', () => {
  it('keeps the short names when they differ', () => {
    expect(stretchEnds('King St West at Peter St', 'King St West at Spadina Ave West Side')).toEqual(['Peter St', 'Spadina Ave']);
  });
  it('gives each end its own cross street when the short names collide', () => {
    expect(stretchEnds('King St West at Queen St West', 'Roncesvalles Ave at Queen St West North Side')).toEqual(['Queen St West (King St West)', 'Queen St West (Roncesvalles Ave)']);
  });
});
