import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CARD_CALLOUT, CardCallout } from '../cardUi';

describe('Card callout box (CIV-900 S3)', () => {
  it('draws the shared callout surface and keeps the caller\'s spacing and attributes', () => {
    const { getByTestId } = render(<CardCallout className="mb-3" data-testid="box">Text</CardCallout>);
    const box = getByTestId('box');
    expect(box.className).toBe(`${CARD_CALLOUT} mb-3`);
    expect(box.textContent).toBe('Text');
  });

  it('tinted tones keep the shared outline under the status tint (History\'s better or worse summary, CIV-1127)', () => {
    const { getByTestId } = render(<>
      <CardCallout tone="negative" data-testid="worse">Worse</CardCallout>
      <CardCallout tone="positive" data-testid="better">Better</CardCallout>
    </>);
    expect(getByTestId('worse').className).toBe('rounded-xl border border-[var(--border-primary)] px-3 py-2.5 bg-[var(--status-negative-bg)]');
    expect(getByTestId('better').className).toBe('rounded-xl border border-[var(--border-primary)] px-3 py-2.5 bg-[var(--status-positive-bg)]');
  });
});
