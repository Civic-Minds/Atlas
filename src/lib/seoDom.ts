import type { ResolvedSeo } from '../../shared/seo';

function ensureMeta(doc: Document, attr: 'name' | 'property', key: string): HTMLMetaElement {
  let el = doc.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = doc.createElement('meta');
    el.setAttribute(attr, key);
    doc.head.appendChild(el);
  }
  return el;
}

/** The URL as a string if it is http(s), otherwise null, so a bad origin can never become a javascript: link. */
export function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

/** Write a route's title, description, canonical, share tags and robots into the live page. */
export function applySeoToDocument(doc: Document, seo: ResolvedSeo): void {
  doc.title = seo.title;
  ensureMeta(doc, 'name', 'description').setAttribute('content', seo.description);
  ensureMeta(doc, 'property', 'og:title').setAttribute('content', seo.title);
  ensureMeta(doc, 'property', 'og:description').setAttribute('content', seo.description);
  ensureMeta(doc, 'property', 'og:url').setAttribute('content', safeHttpUrl(seo.canonicalUrl) ?? '');
  ensureMeta(doc, 'name', 'twitter:title').setAttribute('content', seo.title);
  ensureMeta(doc, 'name', 'twitter:description').setAttribute('content', seo.description);

  let canonical = doc.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) {
    canonical = doc.createElement('link');
    canonical.setAttribute('rel', 'canonical');
    doc.head.appendChild(canonical);
  }
  const canonicalHref = safeHttpUrl(seo.canonicalUrl);
  if (canonicalHref) canonical.setAttribute('href', canonicalHref);
  else canonical.removeAttribute('href');

  // noindex is removed again when the visitor moves to an indexable route, so a beta-only page
  // cannot leave the whole session marked noindex.
  const robots = doc.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
  if (seo.noindex) ensureMeta(doc, 'name', 'robots').setAttribute('content', 'noindex');
  else robots?.remove();
}
