# Atlas style guide

Read this before any UI work. It records decisions Ryan has already made about how Atlas looks and how it talks. It does not add new rules. When something here and the code disagree, ask before changing either.

Two rules come before everything else:

- Every change to what users see (styles, layout, wording, components, new pages) is shown to Ryan on a running localhost URL, with one line saying what to check, and gets his OK before it merges. A reviewer's approval is not design approval.
- A refactor onto shared components must look the same as `origin/main` unless the visual change was listed and approved. Check every touched page at desktop width and at 390px. Nothing may wrap to two lines or overflow a button.

The guide is in two halves. Read the one your change touches; read both for a change that does both.

- [How Atlas looks](style/VISUAL.md): shared components, pages and layout, tables, colour and shape, map overlays, Live visuals, agency notes, and charts, graphs and graphics (including LinkedIn graphics).
- [How Atlas talks](style/TEXT.md): back links, frequencies, words and times, agency names, less text, research pages, card notices, approval for new wording, and docs.

Rules that code can check are checked by `src/content/__tests__/styleGuard.test.ts`; each half marks them "(checked)".
