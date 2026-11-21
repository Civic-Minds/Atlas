import { useEffect } from 'react';

/**
 * Flags an open prompt on <html> (data-consent-prompt) while it shows: the site footer reserves room and, on phones, the
 * sidebar cards start below it, so no prompt in MAP_PROMPT_SLOT covers a link (CIV-1137; CIV-2004: all three prompts).
 * Counted, so one prompt closing never clears another's flag.
 */
let open = 0;
export function usePromptFlag(shown: boolean): void {
  useEffect(() => {
    if (!shown) return;
    open += 1;
    document.documentElement.dataset.consentPrompt = '';
    return () => { open -= 1; if (open <= 0) { open = 0; delete document.documentElement.dataset.consentPrompt; } };
  }, [shown]);
}
