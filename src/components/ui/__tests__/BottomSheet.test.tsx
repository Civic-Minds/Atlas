import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BottomSheetHandle, bottomSheetBodyClass, useBottomSheet } from '../BottomSheet';

function Sheet({ subject }: { subject: string }) {
  const { expanded, handle } = useBottomSheet(subject);
  return <div data-testid="body" className={bottomSheetBodyClass(expanded)}><BottomSheetHandle expanded={expanded} handle={handle} /></div>;
}

describe('BottomSheet (#1028 item 23)', () => {
  it('a tap on the handle toggles it; a drag up opens, a drag down closes', () => {
    render(<Sheet subject="6" />);
    const handle = screen.getByRole('button', { name: 'Show more' });
    fireEvent.pointerDown(handle, { clientY: 500 }); fireEvent.pointerUp(handle, { clientY: 503 });
    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('body').className).toContain('h-[calc(100dvh-76px)]');
    fireEvent.pointerDown(handle, { clientY: 300 }); fireEvent.pointerUp(handle, { clientY: 420 });
    expect(screen.getByTestId('body').className).toContain('h-[42dvh]');
    fireEvent.pointerDown(handle, { clientY: 500 }); fireEvent.pointerUp(handle, { clientY: 380 });
    expect(screen.getByRole('button', { name: 'Show less' })).toBeInTheDocument();
  });

  it('goes back to short when the subject changes', () => {
    const { result, rerender } = renderHook(({ s }) => useBottomSheet(s), { initialProps: { s: 'a' } });
    act(() => { result.current.handle.onPointerDown({ clientY: 10, currentTarget: {}, pointerId: 1 } as never); });
    act(() => { result.current.handle.onPointerUp({ clientY: 10 } as never); });
    expect(result.current.expanded).toBe(true);
    rerender({ s: 'b' });
    expect(result.current.expanded).toBe(false);
  });

  it('a custom short height replaces the default', () => {
    expect(bottomSheetBodyClass(false, 'h-[30dvh]')).toContain('h-[30dvh]');
    expect(bottomSheetBodyClass(false, 'h-[30dvh]')).not.toContain('h-[42dvh]');
  });
});
