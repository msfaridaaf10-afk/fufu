// Checks WCAG contrast for every text/background token pairing used in app.css.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../public/css/app.css', import.meta.url), 'utf8');

function block(selectorStart) {
  const i = css.indexOf(selectorStart);
  assert.ok(i >= 0, `missing ${selectorStart}`);
  const open = css.indexOf('{', i);
  const close = css.indexOf('}', open);
  const vars = {};
  for (const m of css.slice(open + 1, close).matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6})/g)) vars[m[1]] = m[2];
  return vars;
}
const light = block(':root {');
const dark = { ...light, ...block(':root[data-theme="dark"], :root.is-night {') };
const accents = {
  'light/sage': { ...light, ...block(':root[data-accent="sage"]') },
  'light/rose': { ...light, ...block(':root[data-accent="rose"]') },
  'dark/sage': { ...dark, ...block(':root[data-theme="dark"][data-accent="sage"]') },
  'dark/rose': { ...dark, ...block(':root[data-theme="dark"][data-accent="rose"]') },
};

function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function ratio(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// [text, background, minimum]
const PAIRS = [
  ['ink', 'bg', 4.5], ['ink', 'surface', 4.5], ['ink', 'surface-2', 4.5], ['ink-soft', 'bg', 4.5], ['ink-soft', 'surface', 4.5], ['ink-soft', 'surface-2', 4.5],
  ['accent-ink', 'accent', 4.5], ['accent-soft-ink', 'accent-soft', 4.5], ['accent-text', 'bg', 4.5], ['accent-text', 'surface', 4.5], ['accent-text', 'surface-2', 4.5],
  ['sage-ink', 'sage-soft', 4.5], ['sage-ink', 'surface', 4.5], ['burgundy', 'bg', 4.5], ['burgundy', 'surface', 4.5], ['burgundy', 'paper-cream', 4.5],
  ['attn-ink', 'attn-bg', 4.5], ['ink', 'paper-cream', 4.5], ['ink', 'paper-note', 4.5], ['ink-soft', 'paper-note', 4.5],
  ['cal-sleep-ink', 'cal-sleep', 4.5], ['cal-wind-ink', 'cal-wind', 4.5], ['cal-fixed-ink', 'cal-fixed', 4.5], ['cal-study-ink', 'cal-study', 4.5],
  ['paper-ink', 'paper-cream', 4.5], ['accent-text', 'paper-note', 4.5],
  ['focus', 'bg', 3], ['line-strong', 'bg', 1.9],
];

for (const [name, vars] of Object.entries({ light, dark, ...accents })) {
  test(`contrast: ${name}`, () => {
    const fails = [];
    for (const [fg, bg, min] of PAIRS) {
      if (!vars[fg] || !vars[bg]) continue;
      const r = ratio(vars[fg], vars[bg]);
      if (r < min) fails.push(`${fg} on ${bg}: ${r.toFixed(2)} (needs ${min})`);
    }
    assert.deepEqual(fails, []);
  });
}
