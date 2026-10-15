import { describe, expect, it } from 'vitest';
import { WHATS_NEW, visibleWhatsNew } from './whatsNew';

describe('what\'s new audiences', () => {
  const items = WHATS_NEW.flatMap(release => release.items);

  it('gives every bullet one explicit audience: beta: true, or public (beta left off or false)', () => {
    for (const item of items) {
      expect([undefined, false, true]).toContain(item.beta);
    }
  });

  it('never mixes audiences in a bullet: public bullets do not mention beta, so they stay whole for everyone', () => {
    for (const item of items.filter(i => !i.beta)) {
      expect(`${item.lead ?? ''} ${item.text}`.toLowerCase()).not.toMatch(/\bbeta\b/);
    }
  });

  it('shows beta bullets only when beta is included', () => {
    const publicItems = visibleWhatsNew(false).flatMap(r => r.items);
    const betaItems = visibleWhatsNew(true).flatMap(r => r.items);
    expect(publicItems.every(i => !i.beta)).toBe(true);
    expect(betaItems.length).toBe(items.length);
    expect(publicItems.length).toBeLessThanOrEqual(betaItems.length);
  });
});
