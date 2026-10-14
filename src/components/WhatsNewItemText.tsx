import type { WhatsNewItem } from '../data/whatsNew';

const TAG = 'inline-block rounded-full border border-[var(--accent-border)] px-1.5 py-px font-bold leading-tight text-[var(--accent)] align-middle';

/** One what's-new bullet: bold lead, colon, short clause, then "New" / "Beta" tags with a real space before them. */
export function WhatsNewItemText({ item, tagClass = 'text-xs' }: { item: WhatsNewItem; tagClass?: string }) {
  return (
    <>
      {item.lead && <><strong className="font-black text-[var(--text-primary)]">{item.lead}</strong>: </>}
      {item.text}
      {item.isNew && <>{' '}<span className={`${TAG} ${tagClass} ml-1`}>New</span></>}
      {item.beta && <>{' '}<span className={`${TAG} ${tagClass} ml-1`}>Beta</span></>}
    </>
  );
}
