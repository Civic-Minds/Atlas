/** The small loading ring shown beside "Loading..." text. One look everywhere. */
export default function Spinner() {
  return <div className="w-3 h-3 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin shrink-0" />;
}
