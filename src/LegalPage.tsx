import { ArrowLeft } from 'lucide-react';

type LegalDocument = 'terms' | 'privacy';

export default function LegalPage({ document }: { document: LegalDocument }) {
  const privacy = document === 'privacy';
  return (
    <main className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] px-5 py-8 sm:px-8">
      <div className="max-w-2xl mx-auto">
        <a href="/" className="inline-flex items-center gap-2 text-sm font-bold text-[var(--accent)] hover:underline"><ArrowLeft className="w-4 h-4" /> Atlas by Civic Minds</a>
        <article className="mt-10 space-y-6 text-sm leading-relaxed">
          <header><h1 className="text-2xl font-black">{privacy ? 'Privacy' : 'Terms of Service'}</h1><p className="mt-3 text-[var(--text-dim)]">Last updated September 2026.</p></header>
          {privacy ? <>
            <p>Atlas does not require an account and does not ask for personal information to use the map.</p>
            <section><h2 className="font-black mb-2">Analytics</h2><p>Atlas uses Google Analytics 4, Vercel Web Analytics, and Vercel Speed Insights to understand feature usage and real-user performance. These services may collect page views, device type, approximate location, referrer, and performance measurements. Atlas does not use this information for advertising or account profiling.</p></section>
            <section><h2 className="font-black mb-2">Location</h2><p>If you use the locate-me button, your browser uses its geolocation permission to center the map. Atlas does not receive, store, or log that location.</p></section>
            <section><h2 className="font-black mb-2">Contact</h2><p>If you email us, your message and email address are sent to and retained in the receiving mailbox. General questions can be sent to <a className="text-[var(--accent)] hover:underline" href="mailto:hey@ryanisnota.pro?subject=Atlas%20Contact">hey@ryanisnota.pro</a>.</p></section>
          </> : <>
            <p>Atlas is a free public transit frequency map by Civic Minds. It processes public GTFS schedule data into map views and analysis.</p>
            <section><h2 className="font-black mb-2">Acceptable use</h2><p>Do not scrape, bulk-download, or use Atlas in a way that degrades service for other people. Do not misrepresent Atlas as official transit-agency information or use it to disrupt the service.</p></section>
            <section><h2 className="font-black mb-2">Data accuracy</h2><p>Atlas data comes from transit agencies' published GTFS feeds and may be outdated, incomplete, or wrong. Do not rely on Atlas as your sole source for time-sensitive trip planning; check the agency's own tools.</p></section>
            <section><h2 className="font-black mb-2">No warranty</h2><p>Atlas is provided free of charge and as-is, without a guarantee of uptime, accuracy, or continued availability of any agency's data.</p></section>
          </>}
          <footer className="border-t border-[var(--border-primary)] pt-5 text-[var(--text-dim)]"><a className="text-[var(--accent)] hover:underline" href={privacy ? '/terms' : '/privacy'}>View {privacy ? 'Terms of Service' : 'Privacy'}</a></footer>
        </article>
      </div>
    </main>
  );
}
