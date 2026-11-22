import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import MethodSection from '../sections/MethodSection';
import { METHOD_GROUPS } from '../../../../shared/liveWording';
import { METHOD_TERMS_LINK, PHONE_METHOD_TEXT } from '../../../../shared/liveGlossary';
import type { AgencySummary } from '../../../../shared/liveAgency';

const media = (phone: boolean) => vi.stubGlobal('matchMedia', (q: string) => ({ matches: phone, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
const summary = { routes: [], held: [], weekly: null } as unknown as AgencySummary;

describe('"How this is measured" on phones (#1151, Ryan option 1)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows only the short line for each figure, then the glossary link', () => {
    media(true);
    const { container } = render(<MemoryRouter><MethodSection scope="agency" s={summary} agencyName="TTC" /></MemoryRouter>);
    const text = container.textContent ?? '';
    expect(text).toContain(`Late: ${PHONE_METHOD_TEXT.late}`);
    expect(text).toContain(PHONE_METHOD_TEXT.delivered);
    expect(text).toContain(METHOD_TERMS_LINK);
    expect(text).not.toContain(METHOD_GROUPS.data);
    expect(text).not.toContain(METHOD_GROUPS.limits);
  });

  it('keeps every group on wider screens', () => {
    media(false);
    const { container } = render(<MemoryRouter><MethodSection scope="agency" s={summary} agencyName="TTC" /></MemoryRouter>);
    expect(container.textContent).toContain(METHOD_GROUPS.data);
    expect(container.textContent).not.toContain(`Late: ${PHONE_METHOD_TEXT.late}`);
  });
});
