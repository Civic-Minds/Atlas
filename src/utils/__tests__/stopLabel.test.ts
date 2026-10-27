import { describe, expect, it } from 'vitest';
import { shortStopName, streetJoin, stretchEnds, stretchLabel } from '../stopLabel';

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
});

describe('stretchEnds', () => {
  it('keeps the short names when they differ', () => {
    expect(stretchEnds('King St West at Peter St', 'King St West at Spadina Ave West Side')).toEqual(['Peter St', 'Spadina Ave']);
  });
  it('gives each end its own cross street when the short names collide', () => {
    expect(stretchEnds('King St West at Queen St West', 'Roncesvalles Ave at Queen St West North Side')).toEqual(['Queen St West (King St West)', 'Queen St West (Roncesvalles Ave)']);
  });
});

describe('stretchLabel', () => {
  it('names a stretch the same way on every page (CIV-910)', () => {
    expect(stretchLabel('Dundas St East at Church St', 'Dundas St East at Yonge St - Dundas Station')).toBe('Church St to Dundas Station');
    expect(stretchLabel('Dundas St West at McCaul St', 'Dundas St West at University Ave - St Patrick Station')).toBe('McCaul St to St Patrick Station');
  });
});

describe('streetJoin (CIV-1043)', () => {
  it('joins two street names with "&"', () => {
    expect(streetJoin('Broadview and Queen')).toBe('Broadview & Queen');
    expect(streetJoin('Martin Grove and Steeles')).toBe('Martin Grove & Steeles');
    expect(streetJoin('Dufferin St and Millicent St')).toBe('Dufferin St & Millicent St');
  });
  it('leaves names where "and" is not a street join', () => {
    for (const name of ['Jane and Finch Station Eastbound Platform', 'Guildwood Pkwy at Guild Park and Gardens East Side',
      'Cherry Beach via Distillery and Ookwemin Minising', '1315 and 1319 Neilson Rd', 'Steeles and Islington via Weston', 'Weston Rd via Culford and Benton and Church']) {
      expect(streetJoin(name)).toBe(name);
    }
  });
});
