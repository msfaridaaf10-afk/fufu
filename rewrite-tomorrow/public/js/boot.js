// Applies saved appearance settings before first paint to avoid a flash of the wrong theme.
(function () {
  try {
    var p = JSON.parse(localStorage.getItem('rt:prefs:v1') || '{}');
    var r = document.documentElement;
    if (p.theme) r.dataset.theme = p.theme;
    if (p.accent) r.dataset.accent = p.accent;
    if (p.texture === false) r.dataset.texture = 'off';
    if (p.motion) r.dataset.motion = p.motion;
    var host = r.getAttribute('data-theme');
    if (!p.theme && (host === 'dark' || host === 'light')) { p.theme = host; r.dataset.theme = host; window.__rtHostTheme = host; }
    var theme = p.theme || 'system';
    if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) r.classList.add('is-night');
  } catch (e) { /* storage unavailable: defaults apply */ }
  var h = (location.hash || '').replace(/^#\/?/, '');
  document.documentElement.setAttribute('data-route', !h || h === 'home' || h === 'inside' ? 'home' : 'inner');
})();
