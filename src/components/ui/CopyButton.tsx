import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { COPY_BUTTON } from '../../content/noticeCopy';

/** How long the button reads "Copied" (or the failure) after a click. */
export const COPY_FEEDBACK_MS = 2000;

/**
 * CIV-2117: the one copy button for text a reader pastes elsewhere (a command, a config block). After a click it reads
 * "Copied" for COPY_FEEDBACK_MS, or says the copy failed when the browser refuses the clipboard.
 */
export default function CopyButton({ text, className = '' }: { text: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const show = (next: 'copied' | 'failed') => {
    setState(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), COPY_FEEDBACK_MS);
  };
  const copy = () => {
    const done = navigator.clipboard?.writeText(text);
    if (!done) { show('failed'); return; }
    done.then(() => show('copied'), () => show('failed'));
  };
  const label = state === 'copied' ? COPY_BUTTON.copied : state === 'failed' ? COPY_BUTTON.failed : COPY_BUTTON.copy;
  return (
    <button
      type="button"
      onClick={copy}
      className={`inline-flex items-center gap-1 rounded-md border border-[var(--border-primary)] bg-[var(--bg-primary)] px-2 py-1 text-xs font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] ${className}`.trim()}
    >
      {state === 'copied' ? <Check className="h-3 w-3" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
      <span aria-live="polite">{label}</span>
    </button>
  );
}
