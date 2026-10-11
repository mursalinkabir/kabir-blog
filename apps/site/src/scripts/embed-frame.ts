// Fits each HTML-embed frame to its content. The embed (a sandboxed document with an opaque origin) posts one
// message with its height; nothing else is read from it. Only the frame that sent the message is touched, and the
// value is clamped, so a hostile embed can at worst make its own frame between 120 and 4000 px tall.
const TYPE = 'kabir-embed-height';
const MIN = 120;
const MAX = 4000;

window.addEventListener('message', (event: MessageEvent) => {
  const data = event.data as { type?: unknown; height?: unknown } | null;
  if (!data || data.type !== TYPE || typeof data.height !== 'number' || !Number.isFinite(data.height)) return;
  for (const frame of document.querySelectorAll<HTMLIFrameElement>('iframe[data-embed]')) {
    if (frame.contentWindow === event.source) frame.style.height = `${Math.min(Math.max(Math.ceil(data.height), MIN), MAX)}px`;
  }
});
