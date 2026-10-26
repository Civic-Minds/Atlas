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
});
