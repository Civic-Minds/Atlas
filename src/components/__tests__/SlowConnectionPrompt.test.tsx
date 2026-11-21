import { fireEvent, render, screen } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SlowConnectionPrompt, { readSlowPromptAnswered, rememberSlowPromptAnswered } from '../SlowConnectionPrompt';
import { isSlowConnection, useSlowConnection } from '../../utils/slowConnection';
import { SLOW_CONNECTION_ACCEPT, SLOW_CONNECTION_DECLINE, SLOW_CONNECTION_PROMPT } from '../../content/noticeCopy';

describe('isSlowConnection', () => {
  it('is slow for save-data and for 2G or 3G links only', () => {
    expect(isSlowConnection({ saveData: true, effectiveType: '4g' })).toBe(true);
    for (const t of ['slow-2g', '2g', '3g']) expect(isSlowConnection({ effectiveType: t })).toBe(true);
    expect(isSlowConnection({ effectiveType: '4g' })).toBe(false);
    expect(isSlowConnection({})).toBe(false);
    expect(isSlowConnection(null)).toBe(false);
  });
});

describe('useSlowConnection', () => {
  afterEach(() => { window.history.replaceState({}, '', '/'); });

  it('stays off with nothing reported, and when the feature is off', () => {
    expect(renderHook(() => useSlowConnection(true)).result.current).toBe(false);
    window.history.replaceState({}, '', '/?slowconnection=1');
    expect(renderHook(() => useSlowConnection(false)).result.current).toBe(false);
  });

  it('?slowconnection=1 makes it slow when the feature is on', () => {
    window.history.replaceState({}, '', '/?slowconnection=1');
    expect(renderHook(() => useSlowConnection(true)).result.current).toBe(true);
  });

  it('reads the browser\'s connection hints', () => {
    vi.stubGlobal('navigator', { ...navigator, connection: { effectiveType: '2g' } });
    expect(renderHook(() => useSlowConnection(true)).result.current).toBe(true);
    vi.unstubAllGlobals();
  });
});

describe('SlowConnectionPrompt', () => {
  it('offers the choice with the agreed words and answers each way', () => {
    const accept = vi.fn(); const decline = vi.fn();
    const { container } = render(<SlowConnectionPrompt onAccept={accept} onDecline={decline} />);
    // CIV-2004: centred in the update banner's slot on sm and up; under the header on phones (CSS shows one of the two).
    const [wide, phone] = screen.getAllByRole('status');
    expect(wide).toHaveTextContent(SLOW_CONNECTION_PROMPT);
    expect(wide.className).toContain('left-1/2');
    expect(wide.className).toContain('max-sm:hidden');
    expect(phone.className).toContain('sm:hidden');
    expect(container.querySelectorAll('[role="status"]').length).toBe(2);
    fireEvent.click(screen.getAllByRole('button', { name: SLOW_CONNECTION_ACCEPT })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: SLOW_CONNECTION_DECLINE })[0]);
    expect(accept).toHaveBeenCalledTimes(1);
    expect(decline).toHaveBeenCalledTimes(1);
  });

  it('remembers the answer for the session', () => {
    sessionStorage.clear();
    expect(readSlowPromptAnswered()).toBe(false);
    rememberSlowPromptAnswered();
    expect(readSlowPromptAnswered()).toBe(true);
  });
});
