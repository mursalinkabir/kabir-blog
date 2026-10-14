// Light/dark toggle. The button ships hidden and is revealed here, so it never appears without working.
// The choice is stored per browser; with none stored, the system setting decides (CSS media query).
const root = document.documentElement;
const dark = window.matchMedia('(prefers-color-scheme: dark)');

const isDark = () => (root.dataset.theme ? root.dataset.theme === 'dark' : dark.matches);

function sync(button: HTMLButtonElement) {
  const now = isDark();
  button.setAttribute('aria-label', (now ? button.dataset.toLight : button.dataset.toDark) ?? '');
  button.setAttribute('aria-pressed', String(now));
}

document.querySelectorAll<HTMLButtonElement>('.theme-toggle').forEach((button) => {
  button.hidden = false;
  sync(button);
  button.addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    root.dataset.theme = next;
    try {
      localStorage.setItem('theme', next);
    } catch {
      /* storage blocked: the choice lasts for this page view */
    }
    document.querySelectorAll<HTMLButtonElement>('.theme-toggle').forEach(sync);
  });
});

// Follow the system when no explicit choice was made.
dark.addEventListener('change', () => document.querySelectorAll<HTMLButtonElement>('.theme-toggle').forEach(sync));
