/**
 * CIV-3197: explain_method gives Atlas's own explanation of a method, word for word from the Docs page
 * (docsMethods.generated.ts, generated from src/pages/AboutDocsPage.tsx), so an assistant explains a figure in Atlas's words
 * instead of guessing a cause (#1944).
 */
import { DOCS_PATH, SITE_URL } from '../../shared/rules/paths';
import { DOCS_METHOD_TOPICS } from './docsMethodTopics';
import { DOCS_METHOD_TEXT } from './docsMethods.generated';
import type { Args } from './toolHelpers';

export const docsHandlers: Record<string, (args: Args) => unknown> = {
  explain_method: ({ topic }) => {
    const t = DOCS_METHOD_TOPICS.find(x => x.key === String(topic ?? ''));
    if (!t) throw new Error(`No topic "${topic}". Topics: ${DOCS_METHOD_TOPICS.map(x => x.key).join(', ')}.`);
    return {
      topic: t.key, about: t.about, text: DOCS_METHOD_TEXT[t.key],
      note: "Atlas's own words from its Docs page. Quote or follow them when explaining a figure; don't add a cause they don't give.",
      docsLink: `${SITE_URL}${DOCS_PATH}#${t.sections[0] ?? 'glossary'}`,
    };
  },
};
