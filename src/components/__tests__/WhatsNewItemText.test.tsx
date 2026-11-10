import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WhatsNewItemText } from '../WhatsNewItemText';

const item = { lead: 'Lead', text: 'the clause', isNew: true };

describe('WhatsNewItemText', () => {
  it('keeps a bold lead by default and the "lead: text" punctuation and New tag', () => {
    const { container } = render(<p><WhatsNewItemText item={item} /></p>);
    expect(container.querySelector('strong')).toHaveClass('font-black');
    expect(container.textContent).toMatch(/^Lead: the clause\s*New$/);
  });

  it('takes a normal-weight lead when asked', () => {
    const { container } = render(<p><WhatsNewItemText item={item} leadClass="font-normal" /></p>);
    expect(container.querySelector('strong')).toHaveClass('font-normal');
    expect(container.querySelector('strong')).not.toHaveClass('font-black');
  });
});
