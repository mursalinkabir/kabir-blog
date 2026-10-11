// Closes the "More" dropdown and the phone menu on Escape, an outside click, or when focus leaves them.
// Both are <details>, so they open and close without JS; this only adds the dismissals people expect.
const menus = () => document.querySelectorAll<HTMLDetailsElement>('details.more[open], details.menu[open]');

document.addEventListener('click', (event) => {
  menus().forEach((menu) => {
    if (!menu.contains(event.target as Node)) menu.open = false;
  });
});

document.addEventListener('focusout', (event) => {
  const next = (event as FocusEvent).relatedTarget as Node | null;
  if (!next) return; // focus left the window or went nowhere: leave the menu alone
  menus().forEach((menu) => {
    if (!menu.contains(next)) menu.open = false;
  });
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  menus().forEach((menu) => {
    menu.open = false;
    menu.querySelector<HTMLElement>('summary')?.focus();
  });
});
