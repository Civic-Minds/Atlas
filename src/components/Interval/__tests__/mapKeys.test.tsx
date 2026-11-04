// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { PersistentMapLegend } from '../PersistentMapLegend';
import ResearchLegend from '../ResearchLegend';

// CIV-957: both keys draw the shared MapKey with their words from noticeCopy; the text is unchanged.
describe('map keys', () => {
  it('frequency key: heading, tier steps, then selected and other', () => {
    const text = render(<PersistentMapLegend />).container.textContent ?? '';
    expect(text.startsWith('Frequency')).toBe(true);
    expect(text).toContain('Infrequent');
    expect(text.endsWith('Selected / qualifyingOther routes')).toBe(true);
  });

  it('night key: one shade per grade up to the one selected (CIV-1329)', () => {
    const at = (nightFrequency: 30 | 60 | 90) => render(<ResearchLegend view="night" frequentFrequency={15} nightFrequency={nightFrequency} />).container;
    expect(at(30).querySelectorAll('[aria-hidden="true"]')).toHaveLength(1);
    expect(at(60).textContent).toBe('≤30 min≤60 min');
    expect(at(90).querySelectorAll('[aria-hidden="true"]')).toHaveLength(3);
  });

  it('frequent service key: a second step only in the 30 min view', () => {
    expect(render(<ResearchLegend view="frequent" frequentFrequency={15} />).container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(1);
    expect(render(<ResearchLegend view="frequent" frequentFrequency={30} />).container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);
  });
});
