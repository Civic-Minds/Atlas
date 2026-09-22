import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

type LegalDocument = 'terms' | 'privacy';

const CONTACT_HREF = 'mailto:hey@ryanisnota.pro?subject=Atlas%20Privacy%20or%20Terms';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section><h2 className="font-black mb-2">{title}</h2><div className="space-y-2">{children}</div></section>;
}

export default function LegalPage({ document }: { document: LegalDocument }) {
  const privacy = document === 'privacy';
  return (
    <main className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] px-5 py-8 sm:px-8">
      <div className="max-w-2xl mx-auto">
        <a href="/" className="inline-flex items-center gap-2 text-sm font-bold text-[var(--accent)] hover:underline"><ArrowLeft className="w-4 h-4" /> Atlas by Civic Minds</a>
        <article className="mt-10 space-y-6 text-sm leading-relaxed">
          <header><h1 className="text-2xl font-black">{privacy ? 'Privacy Policy' : 'Terms of Service'}</h1><p className="mt-3 text-[var(--text-dim)]">Last updated September 22, 2026.</p></header>
          {privacy ? <>
            <p>Atlas is a free public transit map and analysis service operated by Civic Minds. You do not need an account or need to provide personal information to browse the map.</p>
            <Section title="Information Atlas handles">
              <p>Atlas may handle information needed to operate and protect the service, such as request time, browser and device information, referring page, approximate location, and performance measurements. Hosting, delivery, and analytics providers may process some of this information on our behalf.</p>
              <p>If you contact us, we receive the email address, message, and any attachments you send. We use that information to respond and keep the correspondence in the receiving mailbox.</p>
            </Section>
            <Section title="Analytics and performance">
              <p>Production Atlas uses Vercel Web Analytics and Vercel Speed Insights to understand usage and measure site performance. These services may receive page views, device and browser information, approximate location, referrer information, and performance measurements.</p>
              <p>Google Analytics 4 may load only when it is configured for the production build and you allow it, or where the current regional consent flow permits it. Google Analytics can receive page views, basic usage events, device and browser information, approximate location, and referrer information. Atlas does not use these analytics services for advertising or account profiling.</p>
              <p>You can allow or decline Google Analytics through <em>Privacy &amp; analytics</em> in the About panel. Atlas also respects Global Privacy Control by declining Google Analytics. Declining Google Analytics does not disable the map.</p>
            </Section>
            <Section title="Browser storage">
              <p>Atlas stores some preferences in your browser, including theme, display settings, filter choices, recent searches, recently viewed routes, and your Google Analytics consent choice. These values help Atlas remember your preferences and are not an Atlas account.</p>
            </Section>
            <Section title="Location features">
              <p>If you choose the locate-me button, your browser may provide precise coordinates after you grant permission. Atlas uses those coordinates to center the map and does not intentionally store them as an Atlas profile.</p>
              <p>If browser geolocation is unavailable or cannot determine a position, Atlas may request approximate city-level coordinates derived from hosting-provider request headers. This fallback is less precise than browser geolocation and is used only to center the map.</p>
            </Section>
            <Section title="Public data and third-party services">
              <p>Atlas processes public transit schedule data, including GTFS feeds published by transit agencies and data providers. Map tiles and map data are provided through CARTO and OpenStreetMap and are subject to their own terms, licenses, and privacy practices.</p>
              <p>Atlas is hosted and delivered through third-party infrastructure. Those providers may process technical request information as part of hosting, security, delivery, analytics, or performance measurement.</p>
            </Section>
            <Section title="Retention and privacy requests">
              <p>We keep information only for as long as reasonably necessary for the purpose for which it was collected, including operating the service, handling security and reliability issues, and responding to correspondence. Provider-specific systems may have their own retention periods.</p>
              <p>To ask what personal information we hold about you, request a correction or deletion, or raise a privacy concern, email <a className="text-[var(--accent)] hover:underline" href={CONTACT_HREF}>hey@ryanisnota.pro</a>. We may need enough information to identify the relevant request, and some records may need to be retained for legal, security, or dispute-resolution reasons.</p>
            </Section>
            <Section title="Children, security, and international processing">
              <p>Atlas is a general-audience service and is not directed at children. We use reasonable technical and organizational measures to protect information, but no internet service can guarantee absolute security.</p>
              <p>Atlas and its service providers may process information in Canada, the United States, or other countries where those providers operate.</p>
            </Section>
            <Section title="Changes to this policy"><p>We may update this policy when Atlas’s practices change. The date at the top shows when the current version took effect.</p></Section>
            <Section title="Contact"><p>Privacy questions can be sent to <a className="text-[var(--accent)] hover:underline" href={CONTACT_HREF}>hey@ryanisnota.pro</a>.</p></Section>
          </> : <>
            <p>Atlas is a free public transit frequency map and analysis service by Civic Minds. It processes public transit schedule data into map views, service-frequency measurements, and related tools.</p>
            <Section title="Using Atlas">
              <p>You may use Atlas for personal, educational, research, and other lawful purposes. You must not use Atlas to break the law, interfere with the service, bypass access controls or rate limits, or create unreasonable load for other users.</p>
              <p>Do not scrape or bulk-download Atlas in a way that degrades the service. Do not misrepresent Atlas as an official transit-agency service or imply that a transit agency endorses it.</p>
            </Section>
            <Section title="Transit data and accuracy">
              <p>Atlas relies on public GTFS schedules and other data supplied by transit agencies and data providers. That information may be delayed, incomplete, discontinued, incorrectly classified, or wrong.</p>
              <p>Atlas is not a substitute for an agency’s official service alerts, schedules, accessibility information, or emergency instructions. Verify time-sensitive travel information with the relevant transit agency.</p>
            </Section>
            <Section title="Third-party data and services"><p>Transit feeds, map data, map tiles, linked agency resources, and other third-party materials remain subject to their own terms, licenses, and availability. Atlas does not control third-party services and is not responsible for their content or outages.</p></Section>
            <Section title="Atlas content and attribution"><p>Civic Minds owns Atlas’s software, branding, presentation, and original analysis except where stated otherwise. You must preserve applicable attribution and license notices for third-party data and services.</p></Section>
            <Section title="Availability and warranties"><p>Atlas is provided free of charge and on an “as-is” and “as-available” basis. We do not promise uninterrupted availability, complete coverage, current data, accurate results, or continued support for any particular feature or agency.</p></Section>
            <Section title="Changes and termination"><p>We may change, suspend, or discontinue Atlas or any feature at any time. We may also update these Terms when the service or its practices change. The date at the top shows when the current version took effect.</p></Section>
            <Section title="Regional rights"><p>Depending on where you live, consumer, privacy, and other legal rights may apply in addition to these Terms. Nothing in these Terms is intended to remove rights that cannot legally be waived.</p></Section>
            <Section title="Contact"><p>Questions about these Terms can be sent to <a className="text-[var(--accent)] hover:underline" href={CONTACT_HREF}>hey@ryanisnota.pro</a>.</p></Section>
          </>}
          <footer className="border-t border-[var(--border-primary)] pt-5 text-[var(--text-dim)]"><a className="text-[var(--accent)] hover:underline" href={privacy ? '/terms' : '/privacy'}>View {privacy ? 'Terms of Service' : 'Privacy Policy'}</a></footer>
        </article>
      </div>
    </main>
  );
}
