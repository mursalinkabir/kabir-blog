import { siteStore } from '../../site/data/store';
import { Shell } from '../../site/views/Shell';
import { notFoundPage } from '../../site/views/pages/static';

/** The English 404 page, as the Astro site had. */
export default async function NotFound() {
  const site = await siteStore().get();
  const { body } = notFoundPage();
  return (
    <Shell site={site} locale="en" path="/404.html">
      {body}
    </Shell>
  );
}
