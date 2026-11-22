import { describe, expect, it } from 'vitest';
import { INSTRUCTIONS } from '../mcp/toolDefs';

// #1689, Ryan picked 1: asked for ridership or fares, the answer says Atlas has no figure and gives no remembered number unless asked.
describe('server instructions: ridership and fares', () => {
  it('says Atlas has none and rules out a number from memory unless asked', () => {
    expect(INSTRUCTIONS).toContain('Atlas has no ridership or fare figures.');
    expect(INSTRUCTIONS).toContain('give no number from your own memory unless the person asks for one');
  });
});
