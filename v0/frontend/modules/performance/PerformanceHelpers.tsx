import React from 'react';

export function formatDelay(seconds: number): string {
  const abs = Math.abs(seconds);
  if (abs < 60) return `${Math.round(seconds)}s`;
  const mins = Math.round(seconds / 60);
  return `${mins > 0 ? '+' : ''}${mins}m`;
}

export function delaySeverity(seconds: number): string {
  const abs = Math.abs(seconds);
  if (abs <= 60) return 'text-emerald-400';
  if (abs <= 180) return 'text-yellow-400';
  if (abs <= 300) return 'text-orange-400';
  return 'text-red-400';
}

export function delayBg(seconds: number): string {
  const abs = Math.abs(seconds);
  if (abs <= 60) return 'border-emerald-500';
  if (abs <= 180) return 'border-yellow-500';
  if (abs <= 300) return 'border-orange-500';
  return 'border-red-500';
}

export function healthColor(score: number): string {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 60) return 'text-yellow-400';
  if (score >= 40) return 'text-orange-400';
  return 'text-red-400';
}

export function healthBg(score: number): string {
  if (score >= 80) return 'bg-emerald-500';
  if (score >= 60) return 'bg-yellow-400';
  if (score >= 40) return 'bg-orange-400';
  return 'bg-red-500';
}

export function ghostRateColor(rate: number): string {
  if (rate <= 0.05) return 'text-emerald-400';
  if (rate <= 0.15) return 'text-yellow-400';
  if (rate <= 0.30) return 'text-orange-400';
  return 'text-red-400';
}

export function feedQualitySummary(score: number): string {
  if (score >= 90) return 'Trips and positions are matching cleanly.';
  if (score >= 75) return 'Feed is usable, with some drift in assignment or stability.';
  if (score >= 50) return 'Feed quality is mixed. Expect noticeable matching gaps.';
  if (score >= 25) return 'Realtime feed is unreliable right now.';
  return 'Realtime feed quality is near-zero right now.';
}

export function feedQualityHeadline(score: number | null, matchRate: number | null): string {
  if (score === null) return 'Waiting for realtime feed diagnostics.';
  if (score < 25 && matchRate !== null && matchRate >= 90) {
    return 'Trip matching is landing, but the feed itself looks unstable.';
  }
  if (score < 25) return 'Realtime feed quality is breaking down right now.';
  if (score < 50) return 'Realtime feed quality is weak and likely affecting downstream metrics.';
  if (score < 75) return 'Realtime feed is usable, but not especially trustworthy.';
  return 'Realtime feed looks healthy enough to trust for active monitoring.';
}

export function headwayColor(mins: number | null): string {
  if (mins === null) return 'text-[var(--text-muted)]';
  if (mins <= 6) return 'text-emerald-400';
  if (mins <= 10) return 'text-yellow-400';
  if (mins <= 15) return 'text-orange-400';
  return 'text-red-400';
}

export function SectionShell({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 space-y-3">
      <div className="space-y-1">
        <h2 className="text-[13px] font-bold tracking-tight text-[var(--text-primary)]">{title}</h2>
        <p className="text-[12px] text-[var(--text-muted)]">{description}</p>
      </div>
      {children}
    </section>
  );
}
