import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import LegalPage from '../LegalPage';

describe('LegalPage', () => {
  it('renders the expanded privacy policy with a specific update date', () => {
    render(<LegalPage document="privacy" />);

    expect(screen.getByRole('heading', { name: 'Privacy Policy' })).toBeTruthy();
    expect(screen.getByText('Last updated September 22, 2026.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Analytics and performance' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Location features' })).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'hey@ryanisnota.pro' })).toHaveLength(2);
  });

  it('renders the expanded terms with accuracy and regional-rights sections', () => {
    render(<LegalPage document="terms" />);

    expect(screen.getByRole('heading', { name: 'Terms of Service' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Transit data and accuracy' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Regional rights' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'View Privacy Policy' })).toHaveAttribute('href', '/privacy');
  });
});
