import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CardReportButton, FlaggableValue, type CardReportButtonHandle } from '../cardUi';

vi.mock('../../../../shared/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../shared/config')>();
  return {
    ...actual,
    CARD_CLICK_TO_FLAG_ENABLED: true,
  };
});

function Harness({ reason }: { reason: string }) {
  const reportRef = React.useRef<CardReportButtonHandle>(null);
  return (
    <div>
      <FlaggableValue reason={reason} reportRef={reportRef}>
        <span>every 10 min</span>
      </FlaggableValue>
      <CardReportButton
        ref={reportRef}
        title="Test route"
        details="details"
        excludeReasons={['Stop is missing, misplaced, or assigned incorrectly']}
      />
    </div>
  );
}

describe('FlaggableValue + CardReportButton', () => {
  it('opens the report dialog with the pre-selected reason when the value is clicked', async () => {
    render(<Harness reason="Frequency is wrong" />);

    fireEvent.click(screen.getByRole('button', { name: /Flag as: Frequency is wrong/i }));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeTruthy();
    });

    const frequency = screen.getByLabelText('Frequency is wrong') as HTMLInputElement;
    expect(frequency.checked).toBe(true);
  });

  it('opens via keyboard without nesting a real button', async () => {
    render(<Harness reason="Frequency is wrong" />);

    const target = screen.getByRole('button', { name: /Flag as: Frequency is wrong/i });
    expect(target.tagName).toBe('DIV');

    fireEvent.keyDown(target, { key: 'Enter' });
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeTruthy();
    });
    expect((screen.getByLabelText('Frequency is wrong') as HTMLInputElement).checked).toBe(true);
  });

  it('still opens when the reason is outside the card list, without pre-checking a ghost option', async () => {
    render(<Harness reason="Stop is missing, misplaced, or assigned incorrectly" />);

    fireEvent.click(screen.getByRole('button', { name: /Flag as: Stop is missing/i }));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeTruthy();
    });

    // Excluded from route card reasons — must not render, and nothing else is auto-checked.
    expect(screen.queryByLabelText('Stop is missing, misplaced, or assigned incorrectly')).toBeNull();
    const checked = screen.getAllByRole('checkbox').filter(el => (el as HTMLInputElement).checked);
    expect(checked).toHaveLength(0);
  });

  it('replaces a prior selection when openWithReason is called again', async () => {
    render(<Harness reason="Frequency is wrong" />);

    fireEvent.click(screen.getByRole('button', { name: /Flag as: Frequency is wrong/i }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());

    // User picks something else too, then cancels and flag-clicks again — prior state must not stick.
    fireEvent.click(screen.getByLabelText('Route data is stale'));
    fireEvent.click(screen.getByRole('button', { name: 'Close report form' }));

    fireEvent.click(screen.getByRole('button', { name: /Flag as: Frequency is wrong/i }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());

    expect((screen.getByLabelText('Frequency is wrong') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Route data is stale') as HTMLInputElement).checked).toBe(false);
  });
});
