import { describe, expect, it } from 'vitest';
import { keepLastWord } from '../keepLastWord';

// CIV-1465: a wrapped name never leaves a short last word alone on its second line.
describe('keepLastWord', () => {
  it('joins a short last word to the word before it', () => {
    expect(keepLastWord('to Irvington via Pru Ctr')).toBe('to Irvington via Pru Ctr');
    expect(keepLastWord('Pearson Airport via Dixon Rd')).toBe('Pearson Airport via Dixon Rd');
  });
  it('leaves a long last word, a two-word name and a single word as they are', () => {
    expect(keepLastWord('to Martin Grove via The Westway')).toBe('to Martin Grove via The Westway');
    expect(keepLastWord('Royal York')).toBe('Royal York');
    expect(keepLastWord('Queen')).toBe('Queen');
  });
});
