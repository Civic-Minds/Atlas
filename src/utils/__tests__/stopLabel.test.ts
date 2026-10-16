import { describe, expect, it } from 'vitest';
import { shortStopName } from '../stopLabel';

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
