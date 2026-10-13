import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ChangelogPage from '../ChangelogPage';

describe('ChangelogPage', () => {
  it('lists versions with their month and no map data lines', () => {
    render(<ChangelogPage />);
    expect(screen.getByRole('heading', { name: /Version 3\.3\s*·\s*\w+ 20\d\d/ })).toBeInTheDocument();
    expect(screen.getByText('What changed in Atlas.')).toBeInTheDocument();
    expect(screen.queryByText(/Map data updated/i)).toBeNull();
  });
});
