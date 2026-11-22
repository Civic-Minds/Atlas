import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import DocsPageLayout from '../DocsPageLayout';

vi.mock('../PageShell', () => ({ default: ({ children }: { children: ReactNode }) => <main>{children}</main> }));

describe('DocsPageLayout contents menu (#1717)', () => {
  it('shows the "On this page" menu when it has entries', () => {
    render(<DocsPageLayout contents={{ items: [{ id: 'a', label: 'A' }] }}><p>Text</p></DocsPageLayout>);
    expect(screen.getByRole('navigation', { name: 'On this page' })).toBeTruthy();
  });

  it('shows nothing and moves the text to its usual column when the menu has no entries', () => {
    const { container } = render(<DocsPageLayout contents={{ title: 'Analytics', items: [] }}><p>Text</p></DocsPageLayout>);
    expect(screen.queryByRole('navigation', { name: 'On this page' })).toBeNull();
    expect(screen.queryByText('On this page')).toBeNull();
    expect(container.querySelector('article')!.className).toContain('lg:col-start-2');
  });
});
