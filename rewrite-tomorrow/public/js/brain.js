// Paper-collage brain, inspired by the handmade brain in the Stolen: Tomorrow case book.
// Decorative metaphor only — the pieces are not a scientific map of brain functions.

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Turns a smooth polygon into a torn-paper edge by adding jittered midpoints.
function torn(points, seed, amp = 4, steps = 3) {
  const r = rng(seed);
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    out.push([x1, y1]);
    for (let k = 1; k <= steps; k++) {
      const t = k / (steps + 1);
      const nx = -(y2 - y1);
      const ny = x2 - x1;
      const len = Math.hypot(nx, ny) || 1;
      const j = (r() - 0.5) * 2 * amp;
      out.push([x1 + (x2 - x1) * t + (nx / len) * j, y1 + (y2 - y1) * t + (ny / len) * j]);
    }
  }
  return `M${out.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L')}Z`;
}

const FRAGS = {
  mind: [[86, 232], [72, 172], [100, 112], [160, 72], [232, 58], [252, 122], [218, 190], [172, 250], [112, 264]],
  work: [[244, 56], [322, 50], [392, 80], [442, 130], [452, 192], [382, 202], [302, 172], [258, 122]],
  rest: [[178, 252], [222, 194], [302, 178], [386, 208], [452, 202], [442, 262], [392, 302], [302, 318], [222, 302]],
  temporal: [[112, 270], [170, 256], [218, 304], [200, 334], [140, 324], [100, 298]],
  cerebellum: [[384, 304], [442, 268], [474, 302], [448, 338], [398, 338]],
  stem: [[300, 316], [342, 314], [346, 382], [320, 396], [306, 352]],
};

export function brainSVG() {
  return `
<svg class="brain" viewBox="0 0 540 440" role="img" aria-labelledby="brain-title brain-desc" focusable="false">
  <title id="brain-title">A paper-collage brain</title>
  <desc id="brain-desc">Torn paper pieces in lavender, sage, cream and plum arranged as a brain, pinned with red thread to three case-file labels: a full head, work that won't fit, and time to wind down. It is an artwork, not a scientific map.</desc>
  <defs>
    <pattern id="ruled" width="12" height="12" patternUnits="userSpaceOnUse">
      <rect width="12" height="12" fill="var(--paper-note)"/>
      <path d="M0 11.5H12" stroke="var(--paper-rule)" stroke-width="1"/>
    </pattern>
    <pattern id="dots" width="10" height="10" patternUnits="userSpaceOnUse">
      <rect width="10" height="10" fill="var(--paper-sage)"/>
      <circle cx="2" cy="2" r="1" fill="var(--paper-dot)"/>
    </pattern>
    <pattern id="news" width="40" height="18" patternUnits="userSpaceOnUse">
      <rect width="40" height="18" fill="var(--paper-news)"/>
      <path d="M3 5H26M3 9H35M3 13H20" stroke="var(--paper-rule)" stroke-width="1.6" stroke-linecap="round"/>
    </pattern>
    <filter id="paper-shadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="2.5" stdDeviation="2.2" flood-color="#171525" flood-opacity=".22"/>
    </filter>
  </defs>

  <!-- case file tag -->
  <g class="case-tag" transform="rotate(-4 90 30)">
    <rect x="22" y="14" width="168" height="34" rx="2" fill="var(--paper-cream)" filter="url(#paper-shadow)"/>
    <text x="34" y="36" class="svg-label">CASE 12 · STOLEN: TOMORROW</text>
  </g>

  <g class="brain-pieces" filter="url(#paper-shadow)">
    <path d="${torn(FRAGS.temporal, 7)}" fill="url(#news)"/>
    <path d="${torn(FRAGS.stem, 11)}" fill="var(--paper-plum)"/>
    <path d="${torn(FRAGS.cerebellum, 5)}" fill="var(--paper-cream)"/>
    <g class="frag" data-frag="rest">
      <path d="${torn(FRAGS.rest, 3)}" fill="url(#dots)"/>
      <g transform="translate(330 252)" class="frag-detail">
        <circle r="26" fill="var(--paper-cream)" stroke="var(--paper-ink)" stroke-width="1.5"/>
        <path d="M0 0V-17M0 0L12 7" stroke="var(--paper-ink)" stroke-width="2" stroke-linecap="round"/>
        <circle r="2.2" fill="var(--paper-ink)"/>
      </g>
    </g>
    <g class="frag" data-frag="work">
      <path d="${torn(FRAGS.work, 2)}" fill="url(#ruled)"/>
      <g class="frag-detail" transform="translate(318 96) rotate(6)">
        <rect x="0" y="0" width="74" height="54" fill="var(--paper-cream)" stroke="var(--paper-ink)" stroke-width="1.2"/>
        <path d="M0 14H74M18 0V54M37 0V54M56 0V54M0 28H74M0 41H74" stroke="var(--paper-rule)" stroke-width="1"/>
        <rect x="19" y="15" width="17" height="12" fill="var(--paper-lav)"/>
        <rect x="38" y="29" width="17" height="11" fill="var(--paper-sage-deep)"/>
      </g>
    </g>
    <g class="frag" data-frag="mind">
      <path d="${torn(FRAGS.mind, 1)}" fill="var(--paper-lav)"/>
      <path class="frag-detail" d="M118 186c10-32 46-48 62-22s-30 34-36 8 30-52 54-30 2 46-20 38" fill="none" stroke="var(--paper-ink)" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>
    </g>
  </g>

  <!-- tape -->
  <rect x="214" y="44" width="54" height="16" fill="var(--tape)" transform="rotate(-12 241 52)"/>
  <rect x="420" y="250" width="48" height="15" fill="var(--tape)" transform="rotate(18 444 257)"/>

  <!-- red thread to labels -->
  <g class="threads" fill="none" stroke="var(--thread)" stroke-width="1.6" stroke-linecap="round">
    <path d="M150 150 C 110 120, 60 110, 40 96"/>
    <path d="M360 120 C 400 96, 430 80, 450 76"/>
    <path d="M300 268 C 300 330, 220 390, 160 404"/>
  </g>
  <g class="pins">
    <circle cx="150" cy="150" r="5.5" fill="var(--burgundy)"/><circle cx="148.5" cy="148.5" r="1.6" fill="#fff" opacity=".6"/>
    <circle cx="360" cy="120" r="5.5" fill="var(--burgundy)"/><circle cx="358.5" cy="118.5" r="1.6" fill="#fff" opacity=".6"/>
    <circle cx="300" cy="268" r="5.5" fill="var(--burgundy)"/><circle cx="298.5" cy="266.5" r="1.6" fill="#fff" opacity=".6"/>
  </g>
  <g class="svg-tags">
    <g class="svg-tag" data-tag="mind" transform="rotate(-3 40 96)">
      <rect x="4" y="80" width="118" height="26" fill="var(--paper-cream)" filter="url(#paper-shadow)"/>
      <text x="12" y="98" class="svg-label">A · A FULL HEAD</text>
    </g>
    <g class="svg-tag" data-tag="work" transform="rotate(3 470 64)">
      <rect x="384" y="50" width="146" height="26" fill="var(--paper-cream)" filter="url(#paper-shadow)"/>
      <text x="392" y="68" class="svg-label">B · WORK WON'T FIT</text>
    </g>
    <g class="svg-tag" data-tag="rest" transform="rotate(-2 120 404)">
      <rect x="40" y="392" width="150" height="26" fill="var(--paper-cream)" filter="url(#paper-shadow)"/>
      <text x="48" y="410" class="svg-label">C · TIME TO WIND DOWN</text>
    </g>
  </g>
</svg>`;
}

export function lightFragment(root, name) {
  root.querySelectorAll('.frag, .svg-tag').forEach((el) => {
    el.classList.toggle('is-lit', !!name && (el.dataset.frag === name || el.dataset.tag === name));
  });
  root.classList.toggle('has-lit', !!name);
}
