import { BACK_PLACES, backLinkLabel } from '../content/backLinks';
import { useCallback, useEffect, useState } from 'react';
import { setConsentPrompt, useConsentPrompt } from '../lib/consentPrompt';
import { getAnalyticsConsent, initAnalytics, setAnalyticsConsent, type AnalyticsConsent } from '../lib/analytics';
import { privacyRegionCountry } from '../lib/privacyRegion';
import { isLocalHost } from '../lib/internalTest';
import { MAP_CONSENT_SLOT, DROPDOWN_PANEL, dropdownAnim, MAP_BADGE, Z_HEADER, Z_MODAL_TOP } from '../styles';
import Toggle from './ui/Toggle';
import ArrowLink from './ui/ArrowLink';
import PanelHeader from './ui/PanelHeader';
import { CLOSE_PLACES, closeLabel, ANALYTICS_CONSENT_PROMPT, ANALYTICS_SETTING_NOTE, PRIVACY_SETTINGS_TITLE, ANALYTICS_CONSENT_LABEL, READ_PRIVACY_POLICY_LABEL, TOGGLE_ANALYTICS_LABEL } from '../content/noticeCopy';
import { PRIVACY_PATH } from '../../shared/pagePaths';

declare global { interface Navigator { globalPrivacyControl?: boolean } }

const STRICT_COUNTRIES = new Set(['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','IS','LI','NO','GB','CH']);

function Controls({ onClose }: { onClose: () => void }) {
  const [consent, setConsent] = useState<AnalyticsConsent | null>(getAnalyticsConsent());
  const choose = (value: AnalyticsConsent) => { setAnalyticsConsent(value); setConsent(value); };
  return <div className={`fixed inset-0 ${Z_MODAL_TOP}`} onClick={onClose}>
    <div className={`${DROPDOWN_PANEL} ${dropdownAnim(true)}`} onClick={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="privacy-settings-title">
      <PanelHeader titleId="privacy-settings-title" title={PRIVACY_SETTINGS_TITLE} onBack={onClose} backLabel={backLinkLabel(BACK_PLACES.aboutAtlas)} onClose={onClose} closeLabel={closeLabel(CLOSE_PLACES.privacySettings)} />
      <div className="overflow-y-auto px-5 py-4 space-y-5 text-xs">
        <p className="leading-relaxed text-[var(--text-dim)]">When enabled, Atlas sends page views and basic usage information to Google Analytics. Atlas does not use this information for advertising or account profiling.</p>
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-bold text-[var(--text-primary)] leading-tight">Google Analytics</p>
              <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">{ANALYTICS_SETTING_NOTE}</p>
            </div>
            <Toggle on={consent === 'granted'} onToggle={() => choose(consent === 'granted' ? 'denied' : 'granted')} label={TOGGLE_ANALYTICS_LABEL} />
          </div>
        </div>
        <ArrowLink tone="inline" href={PRIVACY_PATH}>{READ_PRIVACY_POLICY_LABEL}</ArrowLink>
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
    // Local dev and preview servers load no analytics, so there is nothing to ask about (CIV-1335).
    // initAnalytics still runs so queued events are dropped instead of piling up.
    if (isLocalHost()) { initAnalytics(); return () => window.removeEventListener('atlas:privacy-settings', openSettings); }
    const existing = getAnalyticsConsent();
    if (existing) { initAnalytics(); return () => window.removeEventListener('atlas:privacy-settings', openSettings); }
    if (window.navigator.globalPrivacyControl) { setAnalyticsConsent('denied'); return () => window.removeEventListener('atlas:privacy-settings', openSettings); }
    privacyRegionCountry().then(country => { if (STRICT_COUNTRIES.has(country)) setShowPrompt(true); else initAnalytics(); }).catch(() => setShowPrompt(true));
    return () => window.removeEventListener('atlas:privacy-settings', openSettings);
  }, []);
  // Flag the open prompt on <html> so the site footer can reserve room and the pill never covers its links.
  useEffect(() => {
    if (!showPrompt) return;
    document.documentElement.dataset.consentPrompt = '';
    return () => { delete document.documentElement.dataset.consentPrompt; };
  }, [showPrompt]);
  const choose = useCallback((consent: AnalyticsConsent) => { setAnalyticsConsent(consent); setShowPrompt(false); }, []);
  // On sm and up the map's bottom-left pill row draws the prompt as its last pill (#999);
  // this fixed copy then shows only on phones, and on pages without that row.
  const { rows } = useConsentPrompt();
  useEffect(() => { setConsentPrompt(showPrompt, choose); }, [showPrompt, choose]);
  // inset-x-0 + mx-auto + w-fit centers without the left-1/2 shrink-to-fit squeeze that wrapped the text on phones.
  // Phones show it under the header, clear of the map controls and footer links along the bottom edge.
  const position = `${MAP_CONSENT_SLOT} ${rows > 0 ? 'sm:hidden' : ''}`;
  return <>{showPrompt && <ConsentPill className={`${position} max-w-[calc(100vw-2rem)] ${Z_HEADER}`} choose={choose} />}{showSettings && <Controls onClose={() => setShowSettings(false)} />}</>;
}

const PROMPT_BUTTON = 'shrink-0 text-[var(--text-primary)] transition-colors hover:text-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-border)]';

/** A map prompt as one pill: its sentence, then its buttons. The analytics prompt and the slow-connection prompt (CIV-98) share it. */
export function MapPromptPill({ className = '', label, message, actions, role = 'dialog', wrapOnPhones = false }: { className?: string; label: string; message: string; actions: ReadonlyArray<{ label: string; onClick: () => void }>; role?: 'dialog' | 'status'; /** A sentence too long for one line on a phone wraps there, its buttons on the last line. */ wrapOnPhones?: boolean }) {
  const fit = wrapOnPhones ? 'min-h-8 sm:h-8 sm:whitespace-nowrap max-sm:flex-wrap max-sm:py-1.5' : 'h-8 max-sm:h-[32px] whitespace-nowrap';
  return <div role={role} aria-label={label} className={`${className} ${fit} w-fit ${MAP_BADGE} gap-3 max-[370px]:gap-2 max-[370px]:px-2 text-xs font-bold text-[var(--text-muted)]`}><span>{message}</span>{actions.map(a => <button key={a.label} type="button" onClick={a.onClick} className={PROMPT_BUTTON}>{a.label}</button>)}</div>;
}

/** The prompt's pill: the fixed copy above, and the last pill of the map's bottom-left row. */
export function ConsentPill({ className = '', choose }: { className?: string; choose: (consent: AnalyticsConsent) => void }) {
  return <MapPromptPill className={className} label={ANALYTICS_CONSENT_LABEL} message={ANALYTICS_CONSENT_PROMPT} actions={[{ label: 'Allow', onClick: () => choose('granted') }, { label: 'Decline', onClick: () => choose('denied') }]} />;
}
