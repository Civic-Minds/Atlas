import { useEffect } from 'react';
import { Link } from 'react-router';
import PageShell from './components/ui/PageShell';

/** Shown for addresses the app has no page for, matching the server's 404 page. */
export default function NotFoundPage() {
  useEffect(() => {
    document.title = 'Page not found: Transit Atlas';
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
      <h1 className="text-2xl font-black mb-3">Page not found</h1>
      <p className="text-[var(--text-secondary)] mb-4">There is no page at this address. The map and the About pages are the places to start.</p>
      <p><Link to="/" className="font-bold underline">Open the Atlas map</Link> &middot; <Link to="/about" className="font-bold underline">About Atlas</Link></p>
    </PageShell>
  );
}
