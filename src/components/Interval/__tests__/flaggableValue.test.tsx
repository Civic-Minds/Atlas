import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CardReportButton, FlaggableValue, type CardReportButtonHandle, REPORT_REASON, type ReportReason } from '../cardUi';

vi.mock('../../../../shared/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../shared/config')>();
  return { ...actual, FEATURES: { ...actual.FEATURES, cardClickToFlag: true } };
});

function Harness({ reason }: { reason: ReportReason }) {
  const reportRef = React.useRef<CardReportButtonHandle>(null);
  return <div>
    <FlaggableValue reason={reason} reportRef={reportRef}><span>every 10 min</span></FlaggableValue>
    <CardReportButton ref={reportRef} title="Test route" details="details" excludeReasons={[REPORT_REASON.stop]} />
  </div>;
}

describe('FlaggableValue + CardReportButton', () => {
  async function activateReportMode() {
    fireEvent.click(screen.getByRole('button', { name: 'Report a problem with this card' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /every 10 min/i })).toBeTruthy());
  }

  it('opens the report dialog with the pre-selected reason when the value is clicked', async () => {
    render(<Harness reason={REPORT_REASON.frequency} />);
    await activateReportMode();
    fireEvent.click(screen.getByRole('button', { name: /every 10 min/i }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
    expect((screen.getByLabelText('The frequency is wrong') as HTMLInputElement).checked).toBe(true);
  });

  it('opens from the active report-mode value without nesting a real button', async () => {
    render(<Harness reason={REPORT_REASON.frequency} />);
    await activateReportMode();
    const target = screen.getByRole('button', { name: /every 10 min/i });
    expect(target.tagName).toBe('BUTTON');
    fireEvent.click(target);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
    expect((screen.getByLabelText('The frequency is wrong') as HTMLInputElement).checked).toBe(true);
  });

  it('still opens when the reason is outside the card list, without pre-checking a ghost option', async () => {
    render(<Harness reason={REPORT_REASON.stop} />);
    await activateReportMode();
    fireEvent.click(screen.getByRole('button', { name: /every 10 min/i }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
    expect(screen.queryByLabelText('Stop is missing, misplaced or assigned incorrectly')).toBeNull();
    expect(screen.queryAllByRole('checkbox').filter(el => (el as HTMLInputElement).checked)).toHaveLength(0);
  });

  it('replaces a prior selection when openWithReason is called again', async () => {
    render(<Harness reason={REPORT_REASON.frequency} />);
    await activateReportMode();
    fireEvent.click(screen.getByRole('button', { name: /every 10 min/i }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('The route data is out of date'));
    fireEvent.click(screen.getByRole('button', { name: 'Close report form' }));
    await activateReportMode();
    fireEvent.click(screen.getByRole('button', { name: /every 10 min/i }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
    expect((screen.getByLabelText('The frequency is wrong') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('The route data is out of date') as HTMLInputElement).checked).toBe(false);
  });
});
