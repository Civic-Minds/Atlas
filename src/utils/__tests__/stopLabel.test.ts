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
});

describe('stretchEnds', () => {
  it('keeps the short names when they differ', () => {
    expect(stretchEnds('King St West at Peter St', 'King St West at Spadina Ave West Side')).toEqual(['Peter St', 'Spadina Ave']);
  });
  it('gives each end its own cross street when the short names collide', () => {
    expect(stretchEnds('King St West at Queen St West', 'Roncesvalles Ave at Queen St West North Side')).toEqual(['Queen St West (King St West)', 'Queen St West (Roncesvalles Ave)']);
  });
});
