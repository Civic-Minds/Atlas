import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ResearchMethod from '../ResearchMethod';

const labels = (container: HTMLElement) => [...container.querySelectorAll('strong')].map(el => el.textContent);

describe('ResearchMethod (CIV-1167)', () => {
  it('puts the parts in the template order, whatever order the page passes them in', () => {
    const { container } = render(<ResearchMethod parts={{ limitations: 'L', sources: 'S', whatCounted: 'W', sample: 'Sa', dateConducted: 'D', rechecked: 'R', dateUpdated: 'U', notFound: 'N', numbers: 'H' }} />);
    expect(screen.getByRole('heading', { name: 'How we did this' })).toBeInTheDocument();
    expect(labels(container)).toEqual(['Date conducted.', 'Date updated.', 'Sample.', 'Sources.', 'What counted.', 'How we handled numbers.', 'Not found yet.', 'Rechecked.', 'Limitations.']);
  });

  it('shows an optional part only when the page passes it; "What we checked." shows nowhere until it is given text', () => {
    const { container } = render(<ResearchMethod parts={{ dateConducted: 'D', sample: 'Sa', sources: 'S', whatCounted: 'W', limitations: 'L' }} />);
    expect(labels(container)).toEqual(['Date conducted.', 'Sample.', 'Sources.', 'What counted.', 'Limitations.']);
    expect(screen.queryByText('What we checked.')).toBeNull();
  });
});
