import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import RouteRowName from '../RouteRowName';
import { routeLabels } from '../../utils/format';

// CIV-928: lists show the number in bold and the name in a light weight, with no dash.
function rowFor(input: Parameters<typeof routeLabels>[0]) {
  const label = routeLabels(input);
  const { container } = render(<p><RouteRowName shortName={label.primary} name={label.secondary} /></p>);
  const spans = container.querySelectorAll('span');
  return { text: container.textContent, bold: spans[0], light: spans[1] as HTMLElement | undefined };
}

describe('RouteRowName', () => {
  it('a number and a name: the number bold, the name light, no dash', () => {
    const row = rowFor({ shortName: '504', longName: 'King', agencySlug: 'ttc' });
    expect(row.bold.textContent).toBe('504');
    expect(row.bold).toHaveClass('font-black');
    expect(row.light?.textContent).toBe('King');
    expect(row.light).toHaveClass('font-normal');
    expect(row.text).not.toContain('—');
  });

  it('a route whose number is hidden: the line name is the bold part', () => {
    const row = rowFor({ shortName: '1', longName: 'Line 1 (Yonge-University)', routeType: 1, agencySlug: 'ttc' });
    expect(row.bold.textContent).toBe('Line 1');
    expect(row.light?.textContent).toBe('Yonge-University');
  });

  it('a short name only: bold alone', () => {
    const row = rowFor({ shortName: '52', longName: '', agencySlug: 'ttc' });
    expect(row.bold.textContent).toBe('52');
    expect(row.light).toBeUndefined();
  });

  it('a route with no number (DART "GREEN"): its short name stays bold', () => {
    const row = rowFor({ shortName: 'GREEN', longName: 'Green Line', agencySlug: 'dart' });
    expect(row.bold).toHaveClass('font-black');
    expect(row.bold.textContent).not.toBe('');
    expect(row.text).not.toContain('—');
  });
});
