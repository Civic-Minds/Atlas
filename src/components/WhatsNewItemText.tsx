import type { WhatsNewItem } from '../data/whatsNew';

import Tag from './ui/Tag';

/** One what's-new bullet: bold lead, colon, short clause, then "New" / "Beta" tags with a real space before them. */
export function WhatsNewItemText({ item, tagClass = 'text-xs', leadClass = 'font-black', hideNew = false }: { item: WhatsNewItem; tagClass?: string; /** Weight of the lead; the what's-new panel uses a regular weight so its version heading stands out. */ leadClass?: string; /** The what's-new panel's name already says it, so it drops the New pills. */ hideNew?: boolean }) {
  return (
    <>
      {item.lead && <><strong className={`${leadClass} text-[var(--text-primary)]`}>{item.lead}</strong>: </>}
      {item.text}
      {item.isNew && !hideNew && <>{' '}<Tag tone="accent" className={`${tagClass} ml-1`}>New</Tag></>}
      {item.beta && <>{' '}<Tag tone="accent" className={`${tagClass} ml-1`}>Beta</Tag></>}
    </>
  );
}
