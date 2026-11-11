import type { Site } from '../data/site';
import { matchRoute } from '../router';
import { aboutPage, contactPage, contactThanksPage, nowPage, projectPage, projectsPage, resumePage, usesPage } from './pages/static';
import { categoriesIndexPage, categoryPage, homePage, tagPage, tagsIndexPage } from './pages/listing';
import { postPage } from './pages/post';
import type { PageResult } from './pages/types';

/** The page at `pathname` (canonical, with its trailing slash), or null when there is none. */
export async function resolvePage(site: Site, pathname: string): Promise<PageResult | null> {
  const route = matchRoute(pathname);
  if (!route) return null;
  switch (route.kind) {
    case 'home':
      return homePage(site, route.locale, route.page);
    case 'category':
      return categoryPage(site, route.locale, route.category, route.page);
    case 'tag':
      return tagPage(site, route.locale, route.tag, route.page);
    case 'tags':
      return tagsIndexPage(site, route.locale);
    case 'categories':
      return categoriesIndexPage(site, route.locale);
    case 'post':
      return postPage(site, route.locale, route.slug);
    case 'projects':
      return projectsPage(site, route.locale);
    case 'project':
      return projectPage(site, route.locale, route.slug);
    case 'about':
      return aboutPage(site, route.locale);
    case 'now':
      return nowPage(site, route.locale);
    case 'uses':
      return usesPage(site, route.locale);
    case 'resume':
      return resumePage(site, route.locale);
    case 'contact':
      return contactPage(route.locale);
    case 'contact-thanks':
      return contactThanksPage(route.locale);
    case 'search':
      return null; // Task 10
  }
}
