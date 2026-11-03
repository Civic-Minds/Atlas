import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CardHelpNotice } from '../cardUi';
import { unevenServiceNotice } from '../../../content/noticeCopy';

describe('CardHelpNotice', () => {
  it('keeps the Learn more link for callers that pass a target', () => {
    const onLearnMore = vi.fn();
    render(<CardHelpNotice message="Route map unavailable." onLearnMore={onLearnMore} />);
    fireEvent.click(screen.getByRole('button', { name: /Learn more/ }));
    expect(onLearnMore).toHaveBeenCalledTimes(1);
  });

  it('shows the sentence alone when there is no target', () => {
    render(<CardHelpNotice message={unevenServiceNotice(30)} />);
    expect(screen.getByText('Gaps between trips can be up to 30 min.')).toBeTruthy();
    expect(screen.queryByText(/Learn more/)).toBeNull();
  });
});
