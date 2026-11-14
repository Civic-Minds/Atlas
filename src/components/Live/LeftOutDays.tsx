import { excludingText, leftOutReason } from '../../../shared/liveWording';

/**
 * The days left out of a figure, the one way every Live surface says it (CIV-1448): "Excluding Oct 14", with the
 * reason as its hover ("Oct 14 left out: gaps in our recordings that day"). Nothing when every day counted.
 */
export default function LeftOutDays({ dates, className }: { dates: readonly string[]; className?: string }) {
  const text = excludingText(dates);
  if (!text) return null;
  return <span className={className} title={leftOutReason(dates) ?? undefined}>{text}</span>;
}
