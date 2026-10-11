// The copy button is `hidden` in the markup and only revealed here, so without JS there is no dead button.
document.querySelectorAll<HTMLButtonElement>('[data-copy-link]').forEach((button) => {
  const status = button.closest('.share')?.querySelector<HTMLElement>('[data-copy-status]');
  const say = (text: string) => {
    if (status) status.textContent = text;
    setTimeout(() => {
      if (status) status.textContent = '';
    }, 2500);
  };
  if (!navigator.clipboard) return; // stays hidden where copying is impossible
  button.hidden = false;
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copyLink ?? location.href);
      button.classList.add('is-done');
      say(button.dataset.copied ?? '');
      setTimeout(() => button.classList.remove('is-done'), 2000);
    } catch {
      say(button.dataset.failed ?? ''); // permission denied: say so instead of failing silently
    }
  });
});
