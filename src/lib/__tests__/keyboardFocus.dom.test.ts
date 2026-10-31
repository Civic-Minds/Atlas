// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { trackKeyboardFocus } from '../keyboardFocus';

describe('trackKeyboardFocus (#1196)', () => {
  let stop = () => {};
  afterEach(() => { stop(); document.documentElement.removeAttribute('data-keyboard-focus'); });

  it('marks the page on Tab and clears it on a pointer press', () => {
    stop = trackKeyboardFocus();
    const root = document.documentElement;
    expect(root.hasAttribute('data-keyboard-focus')).toBe(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(root.hasAttribute('data-keyboard-focus')).toBe(true);
    document.dispatchEvent(new Event('pointerdown'));
    expect(root.hasAttribute('data-keyboard-focus')).toBe(false);
  });

  it('ignores typing, so a click into the search box and typing shows no ring', () => {
    stop = trackKeyboardFocus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(document.documentElement.hasAttribute('data-keyboard-focus')).toBe(false);
  });
});
