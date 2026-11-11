import config from './security-headers.json';

type Env = Record<string, string | undefined>;

/** The origin of MEDIA_PUBLIC_URL when it is a valid https URL, else null. Never lets the value add directives. */
function mediaOrigin(env: Env): string | null {
  try {
    const u = new URL(env.MEDIA_PUBLIC_URL ?? '');
    return u.protocol === 'https:' ? u.origin : null;
  } catch {
    return null;
  }
}

export interface PageHeaderOptions {
  /** Per-request nonce for the scripts Next and the layout emit. */
  nonce: string;
  env?: Env;
  preview?: boolean;
  /** Never cached by anyone (search results). */
  noStore?: boolean;
}

/** Response headers for a public page. Production-ready. */
export function pageHeaders({ nonce, env = process.env, preview = false, noStore = false }: PageHeaderOptions): Record<string, string> {
  let csp = config['Content-Security-Policy'];
  // Scripts: self, this request's nonce and the listed hosts. The old policy also had 'wasm-unsafe-eval', which only Pagefind needed.
  const dev = env.NODE_ENV === 'development' ? " 'unsafe-eval'" : '';
  csp = csp.replace(/script-src [^;]*/, (m) => {
    const hosts = m.split(' ').filter((t) => t.startsWith('https://'));
    return `script-src 'self' 'nonce-${nonce}'${dev}${hosts.length ? ` ${hosts.join(' ')}` : ''}`;
  });
  const media = mediaOrigin(env);
  if (media) csp = csp.replace(/img-src [^;]*/, (m) => (m.includes(media) ? m : `${m} ${media}`));
  if (preview) csp = csp.replace("frame-ancestors 'none'", "frame-ancestors 'self'");
  const headers: Record<string, string> = {
    'Content-Security-Policy': csp,
    'X-Content-Type-Options': config['X-Content-Type-Options'],
    'Referrer-Policy': config['Referrer-Policy'],
    'Permissions-Policy': config['Permissions-Policy'],
    'Cache-Control': preview || noStore ? 'private, no-store' : 'public, max-age=0, must-revalidate',
  };
  if (preview) headers['X-Robots-Tag'] = 'noindex';
  return headers;
}

/** Headers for /embeds/<id>.html (author HTML in a sandboxed frame). Production-ready. */
export function embedHeaders(): Record<string, string> {
  return { ...config.embeds, 'Cache-Control': 'public, max-age=31536000, immutable' };
}
