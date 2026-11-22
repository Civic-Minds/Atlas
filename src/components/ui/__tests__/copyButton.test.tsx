// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CopyButton, { COPY_FEEDBACK_MS } from '../CopyButton';

describe('CopyButton', () => {
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('copies the text and reads "Copied" briefly', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<CopyButton text="claude mcp add" />);
    await act(async () => { fireEvent.click(screen.getByRole('button')); });
    expect(writeText).toHaveBeenCalledWith('claude mcp add');
    expect(screen.getByRole('button').textContent).toBe('Copied');
    act(() => { vi.advanceTimersByTime(COPY_FEEDBACK_MS); });
    expect(screen.getByRole('button').textContent).toBe('Copy');
  });

  it('says so when the clipboard refuses', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    render(<CopyButton text="x" />);
    await act(async () => { fireEvent.click(screen.getByRole('button')); });
    expect(screen.getByRole('button').textContent).toBe('Couldn’t copy');
  });
});
