// @vitest-environment node
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import HomeStatic from '../HomeStatic';
import { HOME_DESCRIPTION, SITE_NAME } from '../../shared/seo';

describe('the home page text in the served HTML (#1522)', () => {
  it('names the site, says what it is and links to the pages a crawler can read, with no new words', () => {
    const html = renderToString(<HomeStatic agencyPages />);
    expect(html).toContain(SITE_NAME);
    expect(html).toContain(HOME_DESCRIPTION);
    for (const href of ['/agencies', '/about', '/about/docs']) expect(html).toContain(`href="${href}"`);
  });
  it('leaves out the agency list where the build has no agency pages', () => {
    expect(renderToString(<HomeStatic agencyPages={false} />)).not.toContain('href="/agencies"');
  });
});
