import { useEffect, useState } from 'react';
import { getAnalyticsConsent, initAnalytics, setAnalyticsConsent, type AnalyticsConsent } from '../lib/analytics';
import { MAP_BADGE, Z_HEADER, Z_MODAL_TOP } from '../styles';

declare global { interface Navigator { globalPrivacyControl?: boolean } }

const STRICT_COUNTRIES = new Set(['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','IS','LI','NO','GB','CH']);

function Controls({ onClose }: { onClose: () => void }) {
  const [consent, setConsent] = useState<AnalyticsConsent | null>(getAnalyticsConsent());
  const choose = (value: AnalyticsConsent) => { setAnalyticsConsent(value); setConsent(value); };
  return <div role="dialog" aria-label="Privacy settings" className={`fixed bottom-6 left-1/2 -translate-x-1/2 ${Z_MODAL_TOP} ${MAP_BADGE} min-h-8 max-w-[calc(100vw-2rem)] whitespace-nowrap text-[10px] font-bold text-[var(--text-muted)]`}>
    <span>Google Analytics: {consent === 'granted' ? 'on' : 'off'}</span>
    <button type="button" onClick={() => choose('denied')} className="shrink-0 rounded-full border border-[var(--border-primary)] px-2 py-1 text-[var(--text-primary)] transition-colors hover:border-[var(--accent)]">Off</button>
    <button type="button" onClick={() => choose('granted')} className="shrink-0 rounded-full bg-[var(--text-primary)] px-2 py-1 text-[var(--bg-header)] transition-colors hover:opacity-80">On</button>
    <button type="button" aria-label="Close privacy settings" onClick={onClose} className="ml-0.5 shrink-0 text-[var(--text-dim)] hover:text-[var(--text-primary)]">×</button>
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
  return <>{showPrompt && <div role="dialog" aria-label="Analytics consent" className={`fixed bottom-6 left-1/2 h-8 max-w-[calc(100vw-2rem)] -translate-x-1/2 ${Z_HEADER} ${MAP_BADGE} gap-3 text-[10px] font-bold text-[var(--text-muted)]`}><span>Optional analytics help improve Atlas.</span><button type="button" onClick={() => choose('granted')} className="shrink-0 text-[var(--text-primary)] transition-colors hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-border)]">Allow</button><button type="button" onClick={() => choose('denied')} className="shrink-0 text-[var(--text-primary)] transition-colors hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-border)]">Decline</button></div>}{showSettings && <Controls onClose={() => setShowSettings(false)} />}</>;
}
