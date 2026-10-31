import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AboutDocsPage from '../AboutDocsPage';

describe('Docs page Notices section (CIV-1236)', () => {
  it('lists the seven notice groups, each with two of the app’s own notices', () => {
    const { container } = render(<AboutDocsPage />);
    const section = container.querySelector('#notices')!;
    expect([...section.querySelectorAll('h3')].map(h => h.textContent)).toEqual([
      'Old and new schedules', "Errors in the agency's data", 'When a route runs', 'Uneven schedules', 'Filters',
      'Beta and on-demand service', 'Loading, errors and empty lists',
    ]);
    const examples = [...section.querySelectorAll('li')].map(li => li.textContent!.replace(/[⁠ ‑]/g, m => (m === '‑' ? '-' : m === ' ' ? ' ' : '')));
    expect(examples).toHaveLength(14);
    expect(examples).toContain("“[Agency]'s schedule ended on [date]. Times shown may be out of date.”");
    expect(examples).toContain('“Gaps between trips can be up to [N] min.”');
    expect(examples).toContain('“This route runs only from 7–9 AM in this period. No frequency is shown.”');
    expect(examples).toContain("“This route couldn't load.”");
    expect(screen.getByRole('link', { name: 'Notices' })).toHaveAttribute('href', '#notices');
  });

  it('keeps notices out of the glossary', () => {
    const { container } = render(<AboutDocsPage />);
    const glossary = container.querySelector('#glossary')!.textContent!;
    expect(glossary).not.toMatch(/No regular service during this period|weekday schedules vary|schedule ended on/);
  });
});
