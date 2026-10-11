import { categoryFeed } from '~/lib/feed';
import { perLocale } from '~/lib/routes';

// Category feeds are English only; /ja/rss.xml covers Japanese.
export const getStaticPaths = () => perLocale(() => [{}], ['en']);
export const GET = () => categoryFeed('japan-life');
