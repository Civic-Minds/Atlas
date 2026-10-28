import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CONTROL_ACTIVE } from '../../../styles';
import { SideBadge } from '../SideBadge';

describe('Compare side badge (CIV-900)', () => {
  it.each(['A', 'B', 'A+B'] as const)('%s uses the shared light selected tint, not a dark fill', side => {
    const { container } = render(<SideBadge side={side} />);
    const badge = container.firstElementChild as HTMLElement;
    expect(badge.textContent).toBe(side);
    expect(badge.className).toContain(CONTROL_ACTIVE);
    expect(badge.className).not.toContain('bg-[var(--text-primary)]');
  });
});
