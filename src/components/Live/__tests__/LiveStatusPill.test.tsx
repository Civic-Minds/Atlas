import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveStatusPill } from '../LiveStatusPill';
import { LIVE_FEED_STATE_LABEL } from '../../../content/noticeCopy';

describe('LiveStatusPill (CIV-2084)', () => {
  const now = Date.UTC(2026, 10, 21, 22, 0, 0);
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
  afterEach(() => vi.useRealTimers());

  it('names the worst state in view; its hover has each agency, and the retry, with no figures-built date', () => {
    const sec = now / 1000;
    render(<LiveStatusPill feeds={[{ slug: 'ttc', name: 'TTC', newestSec: sec - 10, failed: false }, { slug: 'yrt', name: 'YRT', newestSec: sec - 3600, failed: false }]} retrySeconds={12} />);
    const pill = screen.getByRole('status');
    expect(pill).toHaveTextContent(LIVE_FEED_STATE_LABEL.delayed);
    const title = pill.getAttribute('title') ?? '';
    expect(title).toMatch(/^TTC: positions last came in at /);
    expect(title).toMatch(/\nYRT: positions last came in at /);
    expect(title).toMatch(/Retrying in 12s/);
    expect(title).not.toMatch(/updated/i);
  });

  it('reads Unavailable when a feed failed, and Live when all are fresh', () => {
    const sec = now / 1000;
    const { rerender } = render(<LiveStatusPill feeds={[{ slug: 'ttc', name: 'TTC', newestSec: null, failed: true }]} />);
    expect(screen.getByRole('status')).toHaveTextContent(LIVE_FEED_STATE_LABEL.unavailable);
    rerender(<LiveStatusPill feeds={[{ slug: 'ttc', name: 'TTC', newestSec: sec - 5, failed: false }]} />);
    expect(screen.getByRole('status')).toHaveTextContent(LIVE_FEED_STATE_LABEL.live);
  });
});
