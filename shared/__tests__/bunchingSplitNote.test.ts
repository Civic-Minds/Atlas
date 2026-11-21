import { describe, expect, it } from 'vitest';
import { bunchingSplitNote } from '../liveWording';

describe('the Bunching table note (Ryan, 2026-11-18)', () => {
  it('says what each figure is, word for word, from the rules\' thresholds', () => {
    expect(bunchingSplitNote()).toBe('Bunching: the first figure is gaps under 2 min between vehicles, the second gaps more than twice the scheduled gap.');
  });
});
