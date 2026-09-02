import { useEffect, useState } from 'react';
import { getAnalyticsConsent, initAnalytics, setAnalyticsConsent, type AnalyticsConsent } from '../lib/analytics';

declare global { interface Navigator { globalPrivacyControl?: boolean } }

const STRICT_COUNTRIES = new Set(['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','IS','LI','NO','GB','CH']);

function Controls({ onClose }: { onClose: () => void }) {
  const [consent, setConsent] = useState<AnalyticsConsent | null>(getAnalyticsConsent());
  const choose = (value: AnalyticsConsent) => { setAnalyticsConsent(value); setConsent(value); };
  return <div className="fixed bottom-4 right-4 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-[var(--border-primary)] bg-[var(--bg-header)] p-4 text-xs text-[var(--text-primary)] shadow-xl">
    <div className="flex items-start justify-between gap-3"><div><p className="font-black">Privacy settings</p><p className="mt-2 leading-relaxed text-[var(--text-dim)]">Google Analytics helps us understand which parts of Atlas people use. Atlas works fully without it.</p></div><button type="button" aria-label="Close privacy settings" onClick={onClose} className="text-[var(--text-dim)]">×</button></div>
    <div className="mt-3 flex items-center justify-between gap-2"><span className="text-[var(--text-muted)]">Google Analytics: {consent === 'granted' ? 'on' : 'off'}</span><div className="flex gap-2"><button type="button" onClick={() => choose('denied')} className="rounded-lg border border-[var(--border-primary)] px-2.5 py-1.5 font-bold">Off</button><button type="button" onClick={() => choose('granted')} className="rounded-lg bg-[var(--text-primary)] px-2.5 py-1.5 font-bold text-[var(--bg-header)]">On</button></div></div>
  </div>;
}

export default function AnalyticsConsent() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  useEffect(() => {
    const openSettings = () => setShowSettings(true);
    window.addEventListener('atlas:privacy-settings', openSettings);
    const existing = getAnalyticsConsent();
    if (existing) { initAnalytics(); return () => window.removeEventListener('atlas:privacy-settings', openSettings); }
    if (window.navigator.globalPrivacyControl) { setAnalyticsConsent('denied'); return () => window.removeEventListener('atlas:privacy-settings', openSettings); }
    fetch('/api/privacy-region').then(r => r.ok ? r.json() as Promise<{ country?: string }> : Promise.reject()).then(({ country }) => { if (STRICT_COUNTRIES.has(country ?? 'XX')) setShowPrompt(true); else initAnalytics(); }).catch(() => setShowPrompt(true));
    return () => window.removeEventListener('atlas:privacy-settings', openSettings);
  }, []);
  const choose = (consent: AnalyticsConsent) => { setAnalyticsConsent(consent); setShowPrompt(false); };
  return <>{showPrompt && <div className="fixed bottom-4 left-4 z-50 w-[min(27rem,calc(100vw-2rem))] rounded-xl border border-[var(--border-primary)] bg-[var(--bg-header)] p-4 text-xs text-[var(--text-primary)] shadow-xl"><p className="font-black">Help improve Atlas?</p><p className="mt-2 leading-relaxed text-[var(--text-dim)]">Optional Google Analytics shows which parts of Atlas people use. The map works the same if you say no.</p><div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => choose('denied')} className="rounded-lg border border-[var(--border-primary)] px-3 py-1.5 font-bold">No thanks</button><button type="button" onClick={() => choose('granted')} className="rounded-lg bg-[var(--text-primary)] px-3 py-1.5 font-bold text-[var(--bg-header)]">Allow analytics</button></div></div>}{showSettings && <Controls onClose={() => setShowSettings(false)} />}</>;
}
