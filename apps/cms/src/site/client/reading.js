// The reading bar follows the article, and the contents list follows its visible heading.
const article = document.querySelector('article.post');
if (!article) return;

const header = document.querySelector('.site-header');
const contents = Array.from(article.querySelectorAll('.toc a[href^="#"]')).flatMap((link) => {
  const heading = document.getElementById(link.getAttribute('href').slice(1));
  return heading ? [{ heading, link }] : [];
});

let frame = 0;
let active = null;

function update() {
  frame = 0;
  const viewport = window.innerHeight;
  const head = (header?.getBoundingClientRect().bottom ?? 0) + 20;
  const bounds = article.getBoundingClientRect();
  const distance = bounds.height - (viewport - head);
  const progress = distance > 0 ? Math.max(0, Math.min(1, (head - bounds.top) / distance)) : Number(bounds.bottom <= viewport);
  article.style.setProperty('--article-progress', String(progress));

  let current = null;
  for (const { heading, link } of contents) {
    if (heading.getBoundingClientRect().top > head) break;
    current = link;
  }
  if (current === active) return;
  active?.removeAttribute('aria-current');
  current?.setAttribute('aria-current', 'location');
  active = current;
}

function schedule() {
  if (!frame) frame = requestAnimationFrame(update);
}

window.addEventListener('scroll', schedule, { passive: true });
window.addEventListener('resize', schedule, { passive: true });
const resize = new ResizeObserver(schedule);
resize.observe(article);
if (header) resize.observe(header);
schedule();
