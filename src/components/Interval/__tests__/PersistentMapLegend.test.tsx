import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getHeadwayTiers } from '../../../utils/colors';

let friendly = false;
vi.mock('../../../context/ColorVisionContext', () => ({ useColorVision: () => ({ colorVisionFriendly: friendly, setColorVisionFriendly: () => {} }) }));

import { PersistentMapLegend } from '../PersistentMapLegend';
import { FrequencyBar } from '../../../pageParts';

const swatchColors = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('[aria-hidden="true"][style]')].map(e => e.style.background);

describe('legends follow the colour-vision setting, like the map', () => {
  it('the persistent map legend shows the default palette, then the friendly one', () => {
    friendly = false;
    const a = render(<PersistentMapLegend />);
    expect(swatchColors(a.container).length).toBeGreaterThanOrEqual(6);
    const defaults = swatchColors(a.container).slice(0, 6);
    a.unmount();
    friendly = true;
    const b = render(<PersistentMapLegend />);
    const friendlyColors = swatchColors(b.container).slice(0, 6);
    expect(friendlyColors).not.toEqual(defaults);
    expect(getHeadwayTiers('friendly').map(t => t.color)).not.toEqual(getHeadwayTiers('default').map(t => t.color));
  });

  it('the agency-page frequency bar changes with it too', () => {
    friendly = false;
    const a = render(<FrequencyBar counts={[1, 1, 1, 1, 1, 1, 1]} />);
    const defaults = [...a.container.querySelectorAll<HTMLElement>('button[style]')].map(e => e.style.background);
    a.unmount();
    friendly = true;
    const b = render(<FrequencyBar counts={[1, 1, 1, 1, 1, 1, 1]} />);
    const friendlyBars = [...b.container.querySelectorAll<HTMLElement>('button[style]')].map(e => e.style.background);
    expect(friendlyBars).not.toEqual(defaults);
    expect(friendlyBars[6]).toBe(defaults[6]); // the "no midday" grey is the same in both
  });
});
