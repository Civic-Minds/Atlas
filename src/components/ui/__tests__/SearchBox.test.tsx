import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import SearchBox from '../SearchBox';

function Harness() {
  const [value, setValue] = useState('');
  return <SearchBox value={value} onChange={setValue} placeholder="Find feeds…" />;
}

// CIV-1607: every search box has a clear X once it has text.
describe('SearchBox', () => {
  it('names the field by its hint, shows the X only with text, and the X clears it', () => {
    render(<Harness />);
    const field = screen.getByRole('textbox', { name: 'Find feeds…' });
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
    fireEvent.change(field, { target: { value: 'ttc' } });
    const clear = screen.getByRole('button', { name: 'Clear search' });
    fireEvent.pointerDown(clear);
    expect(field).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
  });
});
