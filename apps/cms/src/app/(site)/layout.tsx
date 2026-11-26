import type { ReactNode } from 'react';
import type { Viewport } from 'next';
import Script from 'next/script';
import { headers } from 'next/headers';
import { htmlLang } from '../../site/i18n';
import { assetUrl } from '../../site/assets';

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0e14' },
  ],
};

export default async function SiteLayout({ children }: { children: ReactNode }) {
  const locale = (await headers()).get('x-locale') === 'ja' ? 'ja' : 'en';
  return (
    <html lang={htmlLang[locale]} suppressHydrationWarning>
      <head>
        {/* Applies a saved light/dark choice before first paint. An external file: scripts here are external or carry the nonce. */}
        <script src="/theme-init.js" />
        <script src="/magazine/enter.js" />
        <link rel="stylesheet" href={assetUrl('/site/site.css')} />
        {/* Preload the one face that paints the first screen. Japanese pages also use Mulish for Latin letters and digits. */}
        <link rel="preload" href="/site/fonts/mulish-latin-wght-normal.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body>
        {children}
        <Script src={assetUrl('/site/site.js')} strategy="afterInteractive" />
      </body>
    </html>
  );
}
