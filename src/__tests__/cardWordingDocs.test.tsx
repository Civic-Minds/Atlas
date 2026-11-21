import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AboutDocsPage from '../AboutDocsPage';
import { FEATURES } from '../../shared/config';

// CIV-1251: Ryan approved _review/card-wording word for word on 2026-11-01. The Docs glossary and Service section, as rendered (rows 2, 4, 5, 6, 9, 12).
describe('card wording (CIV-1251): Docs text, word for word', () => {
  it.each([
    // CIV-1814 item 9: the longest-gap sentence shows only where cards show the gap (FEATURES.unevenBanner, beta).
    `Uneven service: Service that runs through the whole time period, but with gaps that vary.${FEATURES.unevenBanner ? ' The card names the longest gap.' : ''}`,
    'Occasional: School runs, a few trips a day, on-demand.', // CIV-1610 (Ryan): the filter's own words
    'Service class: The kind of service a route runs: regular, part-time or occasional.',
    'Irregular: Shown for a time period when a route runs but its trips don’t come at a consistent gap',
    'Consistent service: Service whose gaps stay within a small allowance across the whole time period, not only in a short burst.',
    'A range such as “every 8–25 min” means your wait is between the two: on a card it’s one row’s waits, and in a list it runs from the shared stretch to the least frequent branch.',
    'The card shows it as “Shared stretch”. It sets the route’s colour and filter result, and each branch is read on its own.',
    'Part-timeOnly at rush hour, evenings or some days.',
    'Routes with only a few trips in a period read “Irregular” instead of a frequency',
  ])('%s', text => {
    const { container } = render(<AboutDocsPage />);
    expect(container.textContent).toContain(text);
  });
  it('drops the Limited glossary entry', () => {
    const { container } = render(<AboutDocsPage />);
    expect(container.querySelector('#glossary')!.textContent).not.toContain('Limited:');
  });
});

