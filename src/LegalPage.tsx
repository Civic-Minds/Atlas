import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import PageContents from './components/PageContents';
import SiteContact from './components/SiteContact';
import SiteFooter from './components/SiteFooter';

type LegalDocument = 'terms' | 'privacy';

const CONTACT_HREF = 'mailto:hey@ryanisnota.pro?subject=Atlas%20Privacy%20or%20Terms';

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <section id={id} className="scroll-mt-8"><h2 className="font-black mb-2">{title}</h2><div className="space-y-2">{children}</div></section>;
}

const CONTENTS = {
  privacy: [
    ['information', 'Information'],
    ['analytics', 'Analytics'],
    ['storage', 'Browser storage'],
    ['location', 'Location'],
    ['third-party', 'Third-party services'],
    ['retention', 'Retention'],
    ['security', 'Security'],
    ['policy-changes', 'Changes'],
    ['contact', 'Contact'],
  ],
  terms: [
    ['using-atlas', 'Using Atlas'],
    ['accuracy', 'Transit data'],
    ['third-party', 'Third-party services'],
    ['attribution', 'Attribution'],
    ['availability', 'Availability'],
    ['changes', 'Changes'],
    ['regional-rights', 'Regional rights'],
    ['contact', 'Contact'],
  ],
} as const;

export default function LegalPage({ document }: { document: LegalDocument }) {
  const privacy = document === 'privacy';
  return (
    <main className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] px-5 py-8 sm:px-8">
      <div className="max-w-5xl mx-auto">
        <a href="/" className="inline-flex items-center gap-2 text-sm font-bold text-[var(--accent)] hover:underline"><ArrowLeft className="w-4 h-4" /> Atlas by Civic Minds</a>
        <div className="mt-10 lg:grid lg:grid-cols-[12rem_minmax(0,42rem)] lg:gap-12 lg:items-start">
          <PageContents items={CONTENTS[privacy ? 'privacy' : 'terms'].map(([id, label]) => ({ id, label }))} />
          <article className="space-y-8 text-sm leading-relaxed">
          <header><h1 className="text-2xl font-black">{privacy ? 'Privacy Policy' : 'Terms of Service'}</h1><p className="mt-3 text-[var(--text-dim)]">Last updated September 22, 2026.</p></header>
          {privacy ? <>
            <p>Atlas is a free public transit map and analysis service operated by Civic Minds. You do not need an account or need to provide personal information to browse the map.</p>
            <Section id="information" title="Information Atlas handles">
              <p>Atlas may handle information needed to operate and protect the service, such as request time, browser and device information, referring page, approximate location, and performance measurements. Hosting, delivery, and analytics providers may process some of this information on our behalf.</p>
              <p>If you contact us, we receive the email address, message, and any attachments you send. We use that information to respond and keep the correspondence in the receiving mailbox.</p>
            </Section>
            <Section id="analytics" title="Analytics and performance">
              <p>Production Atlas uses Vercel Web Analytics and Vercel Speed Insights to understand usage and measure site performance. These services may receive page views, device and browser information, approximate location, referrer information, and performance measurements.</p>
              <p>Google Analytics 4 may load only when it is configured for the production build and you allow it, or where the current regional consent flow permits it. Google Analytics can receive page views, basic usage events, device and browser information, approximate location, and referrer information. Atlas does not use these analytics services for advertising or account profiling.</p>
              <p>You can allow or decline Google Analytics through <em>Privacy &amp; analytics</em> in the About panel. Atlas also respects Global Privacy Control by declining Google Analytics. Declining Google Analytics does not disable the map.</p>
            </Section>
            <Section id="storage" title="Browser storage">
              <p>Atlas stores some preferences in your browser, including theme, display settings, filter choices, recent searches, recently viewed routes, and your Google Analytics consent choice. These values help Atlas remember your preferences and are not an Atlas account.</p>
            </Section>
            <Section id="location" title="Location features">
              <p>If you choose the locate-me button, your browser may provide precise coordinates after you grant permission. Atlas uses those coordinates to center the map and does not intentionally store them as an Atlas profile.</p>
              <p>If browser geolocation is unavailable or cannot determine a position, Atlas may request approximate city-level coordinates derived from hosting-provider request headers. This fallback is less precise than browser geolocation and is used only to center the map.</p>
            </Section>
            <Section id="third-party" title="Public data and third-party services">
              <p>Atlas processes public transit schedule data, including GTFS feeds published by transit agencies and data providers. Map tiles and map data are provided through CARTO and OpenStreetMap and are subject to their own terms, licenses, and privacy practices.</p>
              <p>Atlas is hosted and delivered through third-party infrastructure. Those providers may process technical request information as part of hosting, security, delivery, analytics, or performance measurement.</p>
            </Section>
            <Section id="retention" title="Retention and privacy requests">
              <p>We keep information only for as long as reasonably necessary for the purpose for which it was collected, including operating the service, handling security and reliability issues, and responding to correspondence. Provider-specific systems may have their own retention periods.</p>
              <p>To ask what personal information we hold about you, request a correction or deletion, or raise a privacy concern, email <a className="text-[var(--accent)] hover:underline" href={CONTACT_HREF}>hey@ryanisnota.pro</a>. We may need enough information to identify the relevant request, and some records may need to be retained for legal, security, or dispute-resolution reasons.</p>
            </Section>
            <Section id="security" title="Children, security, and international processing">
              <p>Atlas is a general-audience service and is not directed at children. We use reasonable technical and organizational measures to protect information, but no internet service can guarantee absolute security.</p>
              <p>Atlas and its service providers may process information in Canada, the United States, or other countries where those providers operate.</p>
            </Section>
            <Section id="policy-changes" title="Changes to this policy"><p>We may update this policy when Atlas’s practices change. The date at the top shows when the current version took effect.</p></Section>
            <SiteContact id="contact" title="Contact" subject="Atlas Privacy or Terms" linkLabel="hey@ryanisnota.pro">
              Privacy questions can be sent to us, including requests to access, correct, or delete personal information.
            </SiteContact>
          </> : <>
            <p>Atlas is a free public transit frequency map and analysis service by Civic Minds. It processes public transit schedule data into map views, service-frequency measurements, and related tools.</p>
            <Section id="using-atlas" title="Using Atlas">
              <p>You may use Atlas for personal, educational, research, and other lawful purposes. You must not use Atlas to break the law, interfere with the service, bypass access controls or rate limits, or create unreasonable load for other users.</p>
              <p>Do not scrape or bulk-download Atlas in a way that degrades the service. Do not misrepresent Atlas as an official transit-agency service or imply that a transit agency endorses it.</p>
            </Section>
            <Section id="accuracy" title="Transit data and accuracy">
              <p>Atlas relies on public GTFS schedules and other data supplied by transit agencies and data providers. That information may be delayed, incomplete, discontinued, incorrectly classified, or wrong.</p>
              <p>Atlas is not a substitute for an agency’s official service alerts, schedules, accessibility information, or emergency instructions. Verify time-sensitive travel information with the relevant transit agency.</p>
            </Section>
            <Section id="third-party" title="Third-party data and services"><p>Transit feeds, map data, map tiles, linked agency resources, and other third-party materials remain subject to their own terms, licenses, and availability. Atlas does not control third-party services and is not responsible for their content or outages.</p></Section>
            <Section id="attribution" title="Atlas content and attribution"><p>Civic Minds owns Atlas’s software, branding, presentation, and original analysis except where stated otherwise. You must preserve applicable attribution and license notices for third-party data and services.</p></Section>
            <Section id="availability" title="Availability and warranties"><p>Atlas is provided free of charge and on an “as-is” and “as-available” basis. We do not promise uninterrupted availability, complete coverage, current data, accurate results, or continued support for any particular feature or agency.</p></Section>
            <Section id="changes" title="Changes and termination"><p>We may change, suspend, or discontinue Atlas or any feature at any time. We may also update these Terms when the service or its practices change. The date at the top shows when the current version took effect.</p></Section>
            <Section id="regional-rights" title="Regional rights"><p>Depending on where you live, consumer, privacy, and other legal rights may apply in addition to these Terms. Nothing in these Terms is intended to remove rights that cannot legally be waived.</p></Section>
            <SiteContact id="contact" title="Contact" subject="Atlas Privacy or Terms" linkLabel="hey@ryanisnota.pro">
              Questions about these Terms can be sent to us.
            </SiteContact>
          </>}
          <SiteFooter />
          </article>
        </div>
      </div>
    </main>
  );
}
