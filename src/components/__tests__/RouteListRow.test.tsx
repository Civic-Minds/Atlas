import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RouteListRow from '../RouteListRow';

describe('RouteListRow selected state', () => {
  it('exposes the selected row to screen readers', () => {
    render(<RouteListRow shortName="501" name="Queen" selected />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-current', 'true');
  });

  it('does not mark unselected rows', () => {
    render(<RouteListRow shortName="504" name="King" />);
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-current');
  });
});
