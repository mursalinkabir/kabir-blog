// Runs before first paint so a saved light/dark choice never flashes the other theme.
// No saved choice: leave data-theme unset and let prefers-color-scheme decide (see global.css).
(function () {
  try {
    var saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light') document.documentElement.setAttribute('data-theme', saved);
  } catch (e) {
    /* storage blocked: the system setting applies */
  }
})();
