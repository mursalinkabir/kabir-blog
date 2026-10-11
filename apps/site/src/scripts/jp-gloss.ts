// Positions and dismisses the gloss tooltip on inline Japanese terms.
// The tooltip is shown by CSS (hover, focus); this adds what CSS cannot: keeping it inside the viewport on
// phones, and Escape to dismiss it (WCAG 1.4.13). It is hoverable because it is a child of the term.
const MARGIN = 8;

function place(term: HTMLElement) {
  const tip = term.querySelector<HTMLElement>('.jp-tip');
  if (!tip) return;
  term.classList.remove('is-end', 'is-start');
  const rect = tip.getBoundingClientRect();
  if (rect.right > window.innerWidth - MARGIN) term.classList.add('is-end');
  else if (rect.left < MARGIN) term.classList.add('is-start');
}

document.querySelectorAll<HTMLElement>('.jp').forEach((term) => {
  const show = () => {
    term.classList.remove('is-dismissed');
    requestAnimationFrame(() => place(term));
  };
  term.addEventListener('mouseenter', show);
  term.addEventListener('focus', show);
  term.addEventListener('mouseleave', () => term.classList.remove('is-dismissed'));
  term.addEventListener('blur', () => term.classList.remove('is-dismissed'));
  term.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') term.classList.add('is-dismissed');
  });
});
