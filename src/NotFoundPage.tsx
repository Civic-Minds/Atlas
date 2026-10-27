import { useEffect } from 'react';
import { Link } from 'react-router';
import EmptyPage from './components/ui/EmptyPage';
import ArrowLink from './components/ui/ArrowLink';
import { NOT_FOUND_BODY, NOT_FOUND_TITLE } from './content/noticeCopy';

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
    <EmptyPage title={NOT_FOUND_TITLE} body={NOT_FOUND_BODY} footer={false} action={<ArrowLink as={Link} to="/">Back to the map</ArrowLink>} />
  );
}
