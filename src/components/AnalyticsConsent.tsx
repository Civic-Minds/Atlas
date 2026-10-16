import { useEffect, useState } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { getAnalyticsConsent, initAnalytics, setAnalyticsConsent, type AnalyticsConsent } from '../lib/analytics';
import { DROPDOWN_PANEL, dropdownAnim, MAP_BADGE, Z_HEADER, Z_MODAL_TOP } from '../styles';
import Toggle from './ui/Toggle';
import ArrowLink from './ui/ArrowLink';

declare global { interface Navigator { globalPrivacyControl?: boolean } }

const STRICT_COUNTRIES = new Set(['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','IS','LI','NO','GB','CH']);

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
              <p className="text-xs font-bold text-[var(--text-primary)] leading-tight">Google Analytics</p>
              <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">Optional analytics helps us understand which parts of Atlas people use.</p>
            </div>
            <Toggle on={consent === 'granted'} onToggle={() => choose(consent === 'granted' ? 'denied' : 'granted')} label="Toggle Google Analytics" />
          </div>
        </div>
        <ArrowLink tone="inline" href="/privacy">Read the Privacy Policy</ArrowLink>
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
  // Flag the open prompt on <html> so the site footer can reserve room and the pill never covers its links.
  useEffect(() => {
    if (!showPrompt) return;
    document.documentElement.dataset.consentPrompt = '';
    return () => { delete document.documentElement.dataset.consentPrompt; };
  }, [showPrompt]);
  const choose = (consent: AnalyticsConsent) => { setAnalyticsConsent(consent); setShowPrompt(false); };
  // inset-x-0 + mx-auto + w-fit centers without the left-1/2 shrink-to-fit squeeze that wrapped the text on phones.
  // Phones show it under the header, clear of the map controls and footer links along the bottom edge.
  return <>{showPrompt && <div role="dialog" aria-label="Analytics consent" className={`fixed inset-x-0 top-[4.25rem] mx-auto sm:top-auto sm:bottom-6 h-8 w-fit max-w-[calc(100vw-2rem)] whitespace-nowrap ${Z_HEADER} ${MAP_BADGE} gap-3 text-xs font-bold text-[var(--text-muted)]`}><span>Optional analytics help improve Atlas.</span><button type="button" onClick={() => choose('granted')} className="shrink-0 text-[var(--text-primary)] transition-colors hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-border)]">Allow</button><button type="button" onClick={() => choose('denied')} className="shrink-0 text-[var(--text-primary)] transition-colors hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-border)]">Decline</button></div>}{showSettings && <Controls onClose={() => setShowSettings(false)} />}</>;
}
