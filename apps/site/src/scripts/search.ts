// Pagefind's default UI, loaded on demand. Its bundle is produced by `pagefind --site dist` after the build,
// so it is absent in `astro dev`; we say so instead of failing silently.
declare global {
  interface Window {
    PagefindUI?: new (options: Record<string, unknown>) => unknown;
  }
}

const host = document.getElementById('search');

function load(tag: 'script' | 'link', url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = document.createElement(tag);
    if (el instanceof HTMLLinkElement) {
      el.rel = 'stylesheet';
      el.href = url;
    } else if (el instanceof HTMLScriptElement) {
      el.src = url;
    }
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(url));
    document.head.append(el);
  });
}

async function init() {
  if (!host) return;
  try {
    await Promise.all([load('link', '/pagefind/pagefind-ui.css'), load('script', '/pagefind/pagefind-ui.js')]);
    new window.PagefindUI!({
      element: host,
      showSubResults: true,
      showImages: false,
      translations: JSON.parse(host.dataset.translations ?? '{}'),
    });
  } catch {
    host.textContent = host.dataset.unavailable ?? '';
    host.classList.add('notice');
  }
}

void init();
export {};
