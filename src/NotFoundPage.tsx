import { useEffect } from 'react';
import { Link } from 'react-router';
import PageShell from './components/ui/PageShell';
import { PAGE_ACTION } from './pageStyles';

/** Shown for addresses the app has no page for; public/404.html is the same page for the server's 404. */
export default function NotFoundPage() {
  useEffect(() => {
    document.title = 'Wrong route: Transit Atlas';
    let robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement('meta');
      robots.name = 'robots';
      document.head.appendChild(robots);
    }
    robots.content = 'noindex';
  }, []);
  return (
    <PageShell>
      <h1 className="mt-16 max-w-3xl text-4xl font-black tracking-[-0.045em] sm:text-6xl">This page took the wrong route</h1>
      <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--text-muted)]">We couldn't find that page.</p>
      <p className="mt-6"><Link to="/" className={PAGE_ACTION}>Back to the map</Link></p>
    </PageShell>
  );
}
