import type { ComponentPropsWithoutRef } from 'react';
import { Link, useInRouterContext } from 'react-router';

/**
 * A link to another page of Atlas that opens through the router, without reloading the page (CIV-1619). It is react-router's
 * Link (the same address and the same <a>, so prerendered pages and crawlers see no difference), and a plain <a> where
 * there is no router around it, as in a component rendered alone.
 */
export default function AppLink({ to, ...rest }: { to: string } & ComponentPropsWithoutRef<'a'>) {
  return useInRouterContext() ? <Link to={to} {...rest} /> : <a href={to} {...rest} />;
}
