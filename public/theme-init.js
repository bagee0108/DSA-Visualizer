// Runs before first paint (a blocking <script src> in <head>), so the page
// never flashes the wrong mode. A file rather than inline, so the CSP needs
// no hash. Keep the storage key in step with src/hooks/useTheme.ts.
(function () {
  try {
    var saved = localStorage.getItem('dsa-theme');
    var dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', dark);
  } catch (e) {}
})();
