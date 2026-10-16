import { useEffect } from 'react';
import { Link } from 'react-router';
import EmptyPage from './components/ui/EmptyPage';
import ArrowLink from './components/ui/ArrowLink';

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
    <EmptyPage title="This page took the wrong route" body="We couldn't find that page." footer={false} action={<ArrowLink as={Link} to="/">Back to the map</ArrowLink>} />
  );
}
