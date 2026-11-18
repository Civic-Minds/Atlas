import type { ComponentPropsWithoutRef } from 'react';
import { Link, useInRouterContext, useNavigate } from 'react-router';

/** An address inside Atlas: a path, or a path with a query or #place. Another site, mailto: and the like are not. */
const IN_APP = /^\/(?!\/)|^[?#]/;

/**
 * A link to another page of Atlas that opens through the router, without reloading the page (CIV-1619, CIV-1838). It is
 * react-router's Link (the same address and the same <a>, so prerendered pages and crawlers see no difference). It stays a
 * plain <a> where a router would be wrong: another site, a download, a link that opens a new tab, or no router around it
 * (a component rendered alone).
 */
export default function AppLink({ to, ...rest }: { to: string } & ComponentPropsWithoutRef<'a'>) {
  const router = useInRouterContext();
  return router && IN_APP.test(to) && !rest.target && rest.download == null ? <Link to={to} {...rest} /> : <a href={to} {...rest} />;
}

/** Opens an Atlas path through the router, or by a full load where there is no router: for a click that is not on a link, such as a table row. */
export function useOpenPath() {
  const router = useInRouterContext();
  // The router's presence never changes for a mounted component, so the hook order is stable.
  const navigate = router ? useNavigate() : null; // eslint-disable-line react-hooks/rules-of-hooks
  return (path: string) => { if (navigate) navigate(path); else window.location.assign(path); };
}
