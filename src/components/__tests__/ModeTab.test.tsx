import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ModeTab from '../ModeTab';
import { APP_TAB_ACTIVE, APP_TAB_INACTIVE } from '../../styles';

const tokens = (s: string) => new Set(s.split(/\s+/).filter(Boolean));

// The phone "More" button's classes before it moved onto ModeTab (CIV-900 X4); the move must not change its look.
const OLD_MORE_BUTTON = (active: boolean) => `flex h-8 max-sm:h-[32px] px-3 items-center gap-1.5 rounded-full shrink-0 transition-colors text-xs font-bold border focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-border)] ${active ? APP_TAB_ACTIVE : APP_TAB_INACTIVE}`;

describe('ModeTab menu-trigger', () => {
  it.each([true, false])('keeps the phone More button classes (active %s)', active => {
    render(<ModeTab variant="menu-trigger" label="More" ariaLabel="More Atlas views" expanded={false} active={active} onClick={() => {}} trailing={<span data-testid="chev" />} />);
    const button = screen.getByRole('button', { name: 'More Atlas views' });
    expect(tokens(button.className)).toEqual(tokens(OLD_MORE_BUTTON(active)));
  });

  it('is a disclosure button, not a toggle, with the chevron after the label', () => {
    render(<ModeTab variant="menu-trigger" label="History" ariaLabel="More Atlas views" expanded active onClick={() => {}} trailing={<span data-testid="chev" />} />);
    const button = screen.getByRole('button', { name: 'More Atlas views' });
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.hasAttribute('aria-pressed')).toBe(false);
    expect(button.textContent).toBe('History');
    expect(button.lastElementChild?.getAttribute('data-testid')).toBe('chev');
  });

  it('menu items keep their classes', () => {
    render(<ModeTab variant="menu" icon={null} label="Live" active={false} onClick={() => {}} />);
    expect(tokens(screen.getByRole('button').className)).toEqual(tokens(`sm:hidden flex h-8 px-3 items-center gap-1.5 rounded-full text-xs font-bold border focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-border)] ${APP_TAB_INACTIVE}`));
  });
});
