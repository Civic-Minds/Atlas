import { fireEvent, render, screen } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SlowConnectionPrompt, { readSlowPromptAnswered, rememberSlowPromptAnswered } from '../SlowConnectionPrompt';
import { isSlowConnection, useSlowConnection } from '../../utils/slowConnection';
import { MAP_PROMPT_SLOT } from '../../styles';
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
    render(<SlowConnectionPrompt onAccept={accept} onDecline={decline} />);
    // CIV-2004: one pill in the prompts' centred slot, as the analytics prompt and the update notice.
    const pill = screen.getByRole('status');
    expect(pill).toHaveTextContent(SLOW_CONNECTION_PROMPT);
    expect(pill.className).toContain(MAP_PROMPT_SLOT);
    expect(document.documentElement.dataset.consentPrompt).toBe('');
    fireEvent.click(screen.getByRole('button', { name: SLOW_CONNECTION_ACCEPT }));
    fireEvent.click(screen.getByRole('button', { name: SLOW_CONNECTION_DECLINE }));
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
