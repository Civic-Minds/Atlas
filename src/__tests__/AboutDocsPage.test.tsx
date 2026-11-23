import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AboutDocsPage from '../AboutDocsPage';

describe('Docs page Notices section (CIV-1236)', () => {
  it('sends its logos to the About home page; "Go to Atlas" is the way to the map (#1509)', () => {
    render(<AboutDocsPage />);
    for (const logo of screen.getAllByRole('link', { name: 'Atlas by Civic Minds' })) expect(logo).toHaveAttribute('href', '/about');
    expect(screen.getByRole('link', { name: /Go to Atlas/ })).toHaveAttribute('href', '/');
  });

  it('lists the seven notice groups, each with two of the app’s own notices', () => {
    const { container } = render(<AboutDocsPage />);
    const section = container.querySelector('#notices')!;
    expect([...section.querySelectorAll('h3')].map(h => h.textContent)).toEqual([
      'Old and New Schedules', "Errors in the Agency’s Data", 'When a Route Runs', 'Uneven Schedules', 'Filters',
      'Beta and On-Demand Service', 'Loading, Errors and Empty Lists',
    ]);
    const examples = [...section.querySelectorAll('li')].map(li => li.textContent!.replace(/[⁠ ‑]/g, m => (m === '‑' ? '-' : m === ' ' ? ' ' : '')));
    expect(examples).toHaveLength(14);
    expect(examples).toContain("“[Agency]’s schedule ended on [date]. Times shown may be out of date.”");
    expect(examples).toContain('“Gaps between trips can be up to [N] min.”');
    expect(examples).toContain('“This route runs only from 7–9 AM.”');
    expect(examples).toContain("“This route couldn’t load.”");
    expect(screen.getByRole('link', { name: 'Notices' })).toHaveAttribute('href', '#notices');
  });

  it('has no trip planner or live alerts disclaimer (CIV-1792)', () => {
    const { container } = render(<AboutDocsPage />);
    expect(container.textContent).not.toMatch(/trip plan|live alerts|official resources/i);
  });

  it('keeps notices out of the glossary', () => {
    const { container } = render(<AboutDocsPage />);
    const glossary = container.querySelector('#glossary')!.textContent!;
    expect(glossary).not.toMatch(/weekday schedules vary|schedule ended on/);
  });

  // CIV-1242: Ryan approved these glossary entries word for word; Irregular names the card label, not a notice.
  it('defines Irregular and Occasional', () => {
    const { container } = render(<AboutDocsPage />);
    const glossary = container.querySelector('#glossary')!.textContent!;
    expect(glossary).toContain('Irregular: Shown for a time period when a route runs but its trips don’t come at a consistent gap, so there is no frequency to give. Route cards say “Runs irregularly in this period”; tables and lists say “Irregular”.');
    expect(glossary).toContain('Occasional: School runs, a few trips a day, on-demand. “Hide occasional routes” hides them.');
  });
});

// CIV-1440: Ryan's approved Docs picks 3 and 5-8 (2026-11-20, word for word). Pick 3 (section colours) and pick 6
// (History) show only where those features are on. Ryan: "the Docs page should only mention Studio when on the local site".
describe('Docs page in the public build (CIV-1440)', () => {
  const PICK3 = 'The shared stretch, where all branches run, gets its own colour, and each branch gets its own.';
  const PICK5 = 'State and province pages do the same for every agency in one state or province, and link to its main area pages.';
  const PICK6 = 'It never fills in a year Atlas has no schedule for.';
  const PICK7 = 'Before new data goes live, Atlas compares each agency with what is live.';
  const PICK8 = 'A route that runs for only part of a period shows the hours it runs, and says when it has no trips or runs less often the rest of the time.';

  /** The page rendered with only the named switches on (every other FEATURES switch off, as in the public build). */
  async function renderWith(on: readonly string[]) {
    const real = (await vi.importActual<typeof import('../../shared/config')>('../../shared/config')).FEATURES;
    const features = Object.fromEntries(Object.keys(real).map(k => [k, on.includes(k)]));
    vi.resetModules();
    vi.doMock('../../shared/config', async importOriginal => ({ ...(await importOriginal<typeof import('../../shared/config')>()), FEATURES: features }));
    const { default: Page } = await import('../AboutDocsPage');
    const { container } = render(<Page />);
    vi.doUnmock('../../shared/config');
    return container.textContent ?? '';
  }

  it('with the public build\'s switches (modeTransitions only, rules-flagRules.test.ts) never names Studio, shows picks 5, 7 and 8, and leaves out the beta-only picks 3 and 6', async () => {
    const text = await renderWith(['modeTransitions']);
    expect(text).not.toMatch(/Studio/);
    for (const pick of [PICK5, PICK7, PICK8]) expect(text).toContain(pick);
    expect(text).not.toContain(PICK3);
    expect(text).not.toContain(PICK6);
  });

  // Docs audit before 3.5.0: the headline reads the shared stretch, branches by trips, edge waits count (CIV-1959, CIV-238).
  it('rates a route from its shared stretch and never says a branch decides, on every site', async () => {
    for (const on of [['modeTransitions'], ['segmentColours']]) {
      const text = await renderWith(on);
      expect(text).not.toMatch(/never makes the whole route pass|and each branch are checked on their own/);
      expect(text).toContain('The wait from the start of a time period to its first trip, and from its last trip to the period’s end, counts like any other gap.');
    }
    expect(await renderWith(['modeTransitions'])).toContain('come from the shared stretch, where all of a direction’s branches run');
  });

  it('describes the card’s branch lines and History’s day chip only where those are on', async () => {
    const off = await renderWith(['modeTransitions']);
    expect(off).not.toContain('each branch is its own');
    expect(off).not.toContain('History shows Weekday, Saturday or Sunday');
    const on = await renderWith(['modeTransitions', 'branchReadings', 'history', 'historyDayPicker']);
    expect(on).toContain('each branch is its own');
    expect(on).toContain('History shows Weekday, Saturday or Sunday');
  });

  it('words rush-hour routes and Night Service levels from the rules, with no train window (CIV-2025)', async () => {
    const text = await renderWith(['modeTransitions', 'researchApps']);
    expect(text).not.toContain('Trains are graded on their midday trips');
    expect(text).toContain('passes the filter for a time period only when its trips run the whole period');
    expect(text).toContain('grades routes at every 30, 60 and 90 min or better, 2–5 AM. The main map’s Overnight view stops at every 60 min.');
  });

  it('has a Studio section and contents link only where the studio switch is on', async () => {
    const on = await renderWith(['modeTransitions', 'studio']);
    expect(on).toContain('Studio is Atlas’s workspace for planners');
    expect(on).toContain('Fleet: how many vehicles a route needs.');
    const off = await renderWith(['modeTransitions']);
    expect(off).not.toMatch(/Studio/);
  });

  it('shows picks 3 and 6 where section colours and History are on', async () => {
    const text = await renderWith(['segmentColours', 'history']);
    expect(text).toContain(PICK3);
    expect(text).toContain(PICK6);
  });
});
