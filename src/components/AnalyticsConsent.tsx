import { useEffect, useState } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { getAnalyticsConsent, initAnalytics, setAnalyticsConsent, type AnalyticsConsent } from '../lib/analytics';
import { DROPDOWN_PANEL, dropdownAnim, MAP_BADGE, TRANSITION_BASE, Z_HEADER, Z_MODAL_TOP } from '../styles';

declare global { interface Navigator { globalPrivacyControl?: boolean } }

const STRICT_COUNTRIES = new Set(['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','IS','LI','NO','GB','CH']);

function Toggle({ on }: { on: boolean }) {
  return <span className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${TRANSITION_BASE} ${on ? 'bg-[var(--toggle-on-bg)]' : 'bg-[var(--toggle-off-bg)]'}`}>
    <span className={`absolute top-1 h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${TRANSITION_BASE} ${on ? 'translate-x-5' : 'translate-x-1'}`} />
  </span>;
}

function Controls({ onClose }: { onClose: () => void }) {
  const [consent, setConsent] = useState<AnalyticsConsent | null>(getAnalyticsConsent());
  const choose = (value: AnalyticsConsent) => { setAnalyticsConsent(value); setConsent(value); };
  return <div className={`fixed inset-0 ${Z_MODAL_TOP}`} onClick={onClose}>
    <div className={`${DROPDOWN_PANEL} ${dropdownAnim(true)}`} onClick={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="privacy-settings-title">
      <div className="shrink-0 flex items-center justify-between px-5 border-b border-[var(--border-primary)] h-12">
        <div className="flex items-center gap-1.5">
          <button type="button" aria-label="Back to About Atlas" onClick={onClose} className="w-7 h-7 -ml-1.5 flex items-center justify-center rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-btn-hover)] transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
          <h2 id="privacy-settings-title" className="text-xs font-black text-[var(--text-primary)]">Privacy &amp; analytics</h2>
        </div>
        <button type="button" aria-label="Close privacy and analytics settings" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[var(--bg-btn-hover)] text-[var(--text-dim)] transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="overflow-y-auto px-5 py-4 space-y-5 text-xs">
        <p className="leading-relaxed text-[var(--text-dim)]">When enabled, Atlas sends page views and basic usage information to Google Analytics. Atlas does not use this information for advertising or account profiling.</p>
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-[var(--text-primary)] leading-tight">Google Analytics</p>
              <p className="text-[10px] text-[var(--text-muted)] mt-1 leading-relaxed">Optional analytics helps us understand which parts of Atlas people use.</p>
            </div>
            <button type="button" onClick={() => choose(consent === 'granted' ? 'denied' : 'granted')} aria-label="Toggle Google Analytics" aria-pressed={consent === 'granted'} className="shrink-0">
              <Toggle on={consent === 'granted'} />
            </button>
          </div>
        </div>
        <a href="/privacy" className="inline-block text-[var(--accent)] hover:underline">Read the Privacy Policy →</a>
      </div>
    </div>
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
