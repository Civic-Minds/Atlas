/**
 * Marks the page while the person is moving around with the keyboard (data-keyboard-focus on <html>), and clears it on
 * any pointer press. Text boxes match :focus-visible even when clicked, so their focus ring hangs off this instead: a
 * click into the search box shows no box (594a44070), a Tab into it does (#1196).
 */
export function trackKeyboardFocus(doc: Document = document): () => void {
  const root = doc.documentElement;
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Tab') root.setAttribute('data-keyboard-focus', ''); };
  const onPointer = () => root.removeAttribute('data-keyboard-focus');
  doc.addEventListener('keydown', onKey, true);
  doc.addEventListener('pointerdown', onPointer, true);
  return () => {
    doc.removeEventListener('keydown', onKey, true);
    doc.removeEventListener('pointerdown', onPointer, true);
  };
}
