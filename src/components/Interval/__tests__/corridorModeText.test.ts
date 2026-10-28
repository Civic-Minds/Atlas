import { describe, expect, it } from 'vitest';
import { CORRIDOR_MODE_TEXT } from '../corridorModeText';

describe('corridor mode switch wording (CIV-1092, Ryan 2026-10-28)', () => {
  it('reads "Combine shared stretches", and screen readers hear the same label', () => {
    expect(CORRIDOR_MODE_TEXT.label).toBe('Combine shared stretches');
    expect(CORRIDOR_MODE_TEXT.toggleLabel).toBe(CORRIDOR_MODE_TEXT.label);
    expect(CORRIDOR_MODE_TEXT.description).toBe('Where routes share stops, colours the street by how often any of them comes.');
  });
});
