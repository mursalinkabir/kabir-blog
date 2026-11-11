import pkg from '../../package.json';

/** The release these assets belong to; changes the URL so the one-year cache is safe. */
export const ASSET_VERSION: string = pkg.version;

/** `/site/site.css` -> `/site/site.css?v=0.3.0` */
export const assetUrl = (path: string): string => `${path}?v=${ASSET_VERSION}`;
