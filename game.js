/* ==========================================================================
   The Year We Build Together — an interactive campus by Farida Ibrahim
   All visuals are drawn with canvas code; no image files are needed.
   ========================================================================== */
(() => {
  'use strict';

  // ---------------------------------------------------------------- utils
  const $ = (s) => document.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const TAU = Math.PI * 2;
  const reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const isTouch = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;

  function makeRng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = makeRng(20260928);
  const pick = (arr, r = Math.random) => arr[Math.floor(r() * arr.length)];

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
  };

  function rr(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function distToSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
  }

  const FONT_D = '"Unbounded", "Arial Black", system-ui, sans-serif';
  const FONT_B = '"Manrope", system-ui, sans-serif';

  // ---------------------------------------------------------------- sound
  const Sound = {
    ctx: null, master: null, pad: null,
    muted: store.get('campus-muted') === '1',
    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.8;
        this.master.connect(this.ctx.destination);
        this.startPad();
      } catch (e) { this.ctx = null; }
    },
    setMuted(m) {
      this.muted = m;
      store.set('campus-muted', m ? '1' : '0');
      if (this.master) {
        const t = this.ctx.currentTime;
        this.master.gain.cancelScheduledValues(t);
        this.master.gain.setTargetAtTime(m ? 0 : 0.8, t, 0.05);
      }
    },
    note(freq, when = 0, dur = 0.6, type = 'sine', vol = 0.12, attack = 0.012) {
      if (!this.ctx) return;
      try {
        const c = this.ctx, t = c.currentTime + when;
        const o = c.createOscillator(), g = c.createGain();
        o.type = type; o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(this.master);
        o.start(t); o.stop(t + dur + 0.05);
      } catch (e) { /* ignore */ }
    },
    startPad() {
      const c = this.ctx;
      const g = c.createGain(); g.gain.value = 0;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 0.7;
      const oscs = [110, 164.81, 220.6, 277.2].map((fr, i) => {
        const o = c.createOscillator();
        o.type = i === 3 ? 'sine' : 'triangle';
        o.frequency.value = fr;
        const og = c.createGain(); og.gain.value = i === 3 ? 0 : 0.5;
        o.connect(og); og.connect(f); o.start();
        return { o, og };
      });
      f.connect(g); g.connect(this.master);
      g.gain.setTargetAtTime(0.03, c.currentTime, 2.5);
      this.pad = { g, f, oscs };
    },
    brighten(on) {
      if (!this.pad) return;
      const t = this.ctx.currentTime;
      this.pad.f.frequency.setTargetAtTime(on ? 1500 : 420, t, 1.2);
      this.pad.g.gain.setTargetAtTime(on ? 0.045 : 0.03, t, 1.2);
      this.pad.oscs[3].og.gain.setTargetAtTime(on ? 0.4 : 0, t, 1.2);
    },
    whoosh() {
      if (!this.ctx) return;
      try {
        const c = this.ctx, t = c.currentTime, len = 1.4;
        const buf = c.createBuffer(1, Math.floor(c.sampleRate * len), c.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
        const src = c.createBufferSource(); src.buffer = buf;
        const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
        bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(2400, t + 0.9);
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.35);
        g.gain.exponentialRampToValueAtTime(0.0001, t + len);
        src.connect(bp); bp.connect(g); g.connect(this.master); src.start(t);
      } catch (e) { /* ignore */ }
      [392, 587.33].forEach((f, i) => this.note(f, 0.25 + i * 0.12, 1.4, 'sine', 0.06, 0.2));
    },
    discover() { [659.25, 987.77, 1318.5, 1975.5].forEach((f, i) => this.note(f, i * 0.07, 1.3, 'sine', 0.1)); },
    collect() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.note(f, i * 0.075, 0.7, 'triangle', 0.11));
      this.note(2093, 0.32, 1.5, 'sine', 0.05);
    },
    click() { this.note(880, 0, 0.12, 'sine', 0.05); },
    finale() {
      const chords = [[261.63, 329.63, 392], [220, 277.18, 329.63], [174.61, 220, 261.63], [196, 246.94, 293.66, 392]];
      chords.forEach((ch, i) => ch.forEach((f) => this.note(f, i * 0.9, 1.8, 'triangle', 0.06, 0.25)));
      [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98].forEach((f, i) => this.note(f, 3.6 + i * 0.09, 1.6, 'sine', 0.07));
    },
    pop() { this.note(1200 + Math.random() * 800, 0, 0.18, 'sine', 0.025); },
  };

  // ---------------------------------------------------------------- world
  const W = 2600, H = 2000, CX = 1300, CY = 1000;

  const PATHS = [
    { pts: [[CX, 1990], [CX, CY]], w: 120 },
    { pts: [[CX, CY], [CX, 600]], w: 120 },
    { pts: [[CX, CY], [640, CY]], w: 96 },
    { pts: [[CX, CY], [1965, CY]], w: 96 },
    { pts: [[440, 1685], [2160, 1685]], w: 86 },
    { pts: [[1340, 620], [1706, 620], [1706, 575]], w: 64 },
  ];
  const PLAZA = { x: CX, y: CY, r: 270 };
  const PATIO = { x: 140, y: 880, w: 500, h: 440 };
  const TRACK = { x: 1960, y: 520, w: 560, h: 840 };
  const STEPS = { x: 1070, y: 550, w: 460, h: 88 };

  const B = {
    aud: { x: 950, y: 250, w: 700, d: 300, h: 170 },
    stage: { x: 1650, y: 425, w: 118, d: 125, h: 96 },
    commons: { x: 150, y: 620, w: 470, d: 230, h: 126 },
    tower: { x: 790, y: 620, w: 100, d: 100, h: 290 },
    classW: { x: 500, y: 1400, w: 460, d: 190, h: 128 },
    classE: { x: 1640, y: 1400, w: 460, d: 190, h: 128 },
  };

  const FRAGS = [
    {
      id: 0, x: 1448, y: 1118, zone: 'The Courtyard', hue: '#a855f7',
      title: 'Events people actually want',
      body: 'Ever been to an event that felt planned for someone else? Let’s flip that. Quick polls, a real suggestion box, and simple votes, so events start with what students actually want. Then I take the top picks to the school and help plan them.',
      aside: 'Fewer “why are we doing this?” moments. More “wait, that was actually fun.”',
    },
    {
      id: 1, x: 1708, y: 622, zone: 'The Auditorium · Stage Door', hue: '#e879f9',
      title: 'More shared traditions and memories',
      body: 'The best parts of school are the moments everyone remembers, the ones people still bring up at graduation. I want to help build more shared traditions: things we look forward to every year, that belong to all of us, and that we plan together with the school.',
      aside: 'Future you will be very glad you were there.',
    },
    {
      id: 2, x: 2240, y: 940, zone: 'The Sports Field', hue: '#818cf8',
      title: 'Ideas from every grade',
      body: 'A good team doesn’t only pass to the same three players. Every grade should have a real say, not just the loudest group or the oldest students. I’ll make it easy for anyone, in any grade, to share an idea and actually get it heard.',
      aside: 'Youngest or oldest in the building, your idea counts the same.',
    },
    {
      id: 3, x: 300, y: 1170, zone: 'The Commons', hue: '#fbbf24',
      title: 'Listening, speaking up, and working with the school',
      body: 'Listening comes first. Then comes the part that takes work: bringing your ideas to teachers and administration, speaking up clearly, and working with them on plans the school can approve. And I’ll keep you posted on what happens, even when the answer is “not yet.”',
      aside: 'Good ideas deserve a real conversation, not a shrug.',
    },
  ];
  FRAGS.forEach((f) => { f.collected = false; f.pulse = 0; });

  const ZONES = [
    { id: 'aud', name: 'The Auditorium', tag: 'The stage is set. The seats are suspiciously empty.', test: (x, y) => y < 700 && x > 900 && x < 1860 },
    { id: 'sports', name: 'The Sports Field', tag: 'Scoreboard says nobody’s scored yet. For now.', test: (x, y) => x >= 1880 && y < 1400 },
    { id: 'commons', name: 'The Commons', tag: 'Home of the great lunch-table debates. Best seats on campus.', test: (x, y) => x < 700 && y < 1370 },
    { id: 'court', name: 'The Courtyard', tag: 'The fountain has heard every secret on campus. It isn’t telling.', test: (x, y) => Math.hypot(x - CX, y - CY) < 340 },
    { id: 'rows', name: 'Classroom Row', tag: 'Somewhere in there, a pop quiz is sleeping. Tiptoe.', test: (x, y) => y > 1330 && y < 1800 },
    { id: 'gate', name: 'The Main Gate', tag: 'The campus after hours. Four ideas are out there somewhere.', test: (x, y) => y >= 1800 },
  ];

  // ---------------------------------------------------------------- obstacles
  const OBST = [];
  const rectOb = (x, y, w, h) => OBST.push({ x, y, w, h });
  const circOb = (x, y, r) => OBST.push({ c: true, x, y, r });
  Object.values(B).forEach((b) => rectOb(b.x, b.y, b.w, b.d));
  circOb(CX, CY, 86); // fountain

  const PR = 12; // player collision radius
  function collides(x, y, r) {
    if (x < 50 || x > W - 50 || y < 70 || y > 1948) return true;
    for (let i = 0; i < OBST.length; i++) {
      const o = OBST[i];
      if (o.c) {
        const dx = x - o.x, dy = y - o.y, rr2 = r + o.r;
        if (dx * dx + dy * dy < rr2 * rr2) return true;
      } else {
        const nx = clamp(x, o.x, o.x + o.w), ny = clamp(y, o.y, o.y + o.h);
        const dx = x - nx, dy = y - ny;
        if (dx * dx + dy * dy < r * r) return true;
      }
    }
    return false;
  }

  function onPath(x, y, pad) {
    for (const p of PATHS) {
      for (let i = 0; i < p.pts.length - 1; i++) {
        const [ax, ay] = p.pts[i], [bx, by] = p.pts[i + 1];
        if (distToSeg(x, y, ax, ay, bx, by) < p.w / 2 + pad) return true;
      }
    }
    return false;
  }
  function inRect(x, y, r, pad) { return x > r.x - pad && x < r.x + r.w + pad && y > r.y - pad && y < r.y + (r.h || r.d) + pad; }
  function inBuilding(x, y, pad) { return Object.values(B).some((b) => inRect(x, y, b, pad)); }

  // ---------------------------------------------------------------- props
  const PROPS = []; // static drawables: {y, x, draw}
  const prop = (x, y, draw, extra) => { const p = Object.assign({ x, y, draw }, extra); PROPS.push(p); return p; };

  // Lamps
  const LAMPS = [];
  function addLamp(x, y) {
    if (inBuilding(x, y, 20)) return;
    const l = { x, y, pre: rand() < 0.4, level: 0, onAt: 0, ph: rand() * 10 };
    LAMPS.push(l); circOb(x, y, 6);
    prop(x, y, drawLamp, { lamp: l });
  }
  PATHS.slice(0, 5).forEach((p) => {
    for (let i = 0; i < p.pts.length - 1; i++) {
      const [ax, ay] = p.pts[i], [bx, by] = p.pts[i + 1];
      const len = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / len, uy = (by - ay) / len;
      const nx = -uy, ny = ux;
      let side = 1;
      for (let s = 120; s < len - 60; s += 190) {
        const x = ax + ux * s + nx * (p.w / 2 + 16) * side;
        const y = ay + uy * s + ny * (p.w / 2 + 16) * side;
        side *= -1;
        if (Math.hypot(x - CX, y - CY) < PLAZA.r + 40) continue;
        if (inRect(x, y, STEPS, 10)) continue;
        if (inRect(x, y, PATIO, 10)) continue;
        if (inRect(x, y, TRACK, 10)) continue;
        if (Math.hypot(x - CX, y - 1935) < 120) continue;
        addLamp(x, y);
      }
    }
  });
  const PLAZA_LAMPS = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + TAU / 16;
    const x = CX + Math.cos(a) * (PLAZA.r + 14), y = CY + Math.sin(a) * (PLAZA.r + 14);
    addLamp(x, y);
    PLAZA_LAMPS.push(LAMPS[LAMPS.length - 1]);
  }

  // Benches around the plaza
  [45, 135, 225, 315].forEach((deg) => {
    const a = (deg * Math.PI) / 180;
    const x = CX + Math.cos(a) * 200, y = CY + Math.sin(a) * 200;
    rectOb(x - 28, y - 8, 56, 16);
    prop(x, y + 8, drawBench, { bx: x });
  });

  // Patio tables with umbrellas
  const TABLES = [[245, 960], [455, 975], [555, 1150], [445, 1255], [205, 1285]];
  const UMB_COLORS = [['#a855f7', '#f3e8ff'], ['#7c3aed', '#fde68a'], ['#c026d3', '#f5f3ff'], ['#6d28d9', '#fbcfe8'], ['#9333ea', '#fef3c7']];
  TABLES.forEach(([x, y], i) => { circOb(x, y, 24); prop(x, y + 18, drawTable, { tx: x, ty: y, col: UMB_COLORS[i] }); });

  // Patio string-light poles
  const POLES = [[150, 890], [630, 890], [150, 1312], [630, 1312]];
  POLES.forEach(([x, y]) => { circOb(x, y, 5); prop(x, y, drawPole); });
  const STRINGS = [[0, 1], [2, 3], [0, 3], [1, 2]].map(([a, b]) => ({ a: POLES[a], b: POLES[b] }));
  // Courtyard bunting strung between plaza lamps
  const BUNTING = [[0, 3], [1, 6], [2, 5], [4, 7]].map(([a, b]) => ({ a: PLAZA_LAMPS[a], b: PLAZA_LAMPS[b] }));

  // Bleachers (tiers back to front)
  const BLEACH = { x: 2020, y: 405, w: 440 };
  for (let k = 0; k < 4; k++) {
    const y = BLEACH.y + k * 24, h = 84 - k * 19;
    prop(BLEACH.x, y + 24, drawTier, { k, ty: y, th: h });
  }
  rectOb(BLEACH.x, BLEACH.y, BLEACH.w, 96);
  // Scoreboard
  rectOb(2170, 378, 8, 10); rectOb(2312, 378, 8, 10);
  prop(2245, 388, drawScoreboard);
  // Goals
  prop(2240, 668, drawGoal, { dir: 1 });
  prop(2240, 1222, drawGoal, { dir: -1 });

  // Gate + fence
  rectOb(1205, 1932, 34, 30); rectOb(1361, 1932, 34, 30);
  prop(CX, 1962, drawGate);
  prop(0, 1968, drawFence);

  // Buildings
  const winRng = makeRng(99);
  function mkWins(n) { const a = []; for (let i = 0; i < n; i++) a.push(winRng()); return a; }
  prop(B.aud.x, B.aud.y + B.aud.d, drawAuditorium, { wins: mkWins(40) });
  prop(B.stage.x, B.stage.y + B.stage.d + 0.5, drawStageDoor);
  prop(B.commons.x, B.commons.y + B.commons.d, drawCommons, { wins: mkWins(12) });
  prop(B.tower.x, B.tower.y + B.tower.d, drawTower);
  prop(B.classW.x, B.classW.y + B.classW.d, drawClassroom, { b: B.classW, wins: mkWins(24), label: 'Rooms 101–112' });
  prop(B.classE.x, B.classE.y + B.classE.d, drawClassroom, { b: B.classE, wins: mkWins(24), label: 'Rooms 113–124' });
  prop(CX, CY + 2, drawFountain);

  // Trees
  const TREES = [];
  const TREE_KEEP_OUT = (x, y) =>
    onPath(x, y, 34) || inBuilding(x, y, 46) || Math.hypot(x - CX, y - CY) < PLAZA.r + 50 ||
    inRect(x, y, PATIO, 40) || inRect(x, y, TRACK, 40) || inRect(x, y, STEPS, 40) ||
    inRect(x, y, { x: BLEACH.x, y: 360, w: BLEACH.w, h: 150 }, 30) ||
    FRAGS.some((f) => Math.hypot(x - f.x, y - f.y) < 130) ||
    LAMPS.some((l) => Math.hypot(x - l.x, y - l.y) < 40) ||
    TREES.some((t) => Math.hypot(x - t.x, y - t.y) < 58 * t.s);
  function addTree(x, y, s, kind) {
    const t = { x, y, s, kind, ph: rand() * TAU, tone: Math.floor(rand() * 3) };
    TREES.push(t); circOb(x, y, 12 * s);
    prop(x, y, drawTree, { tree: t });
  }
  addTree(1528, 1182, 1.25, 'round'); // the courtyard's old tree
  // border rows
  for (let x = 70; x < W; x += 95) {
    const y1 = 110 + rand() * 40;
    if (!TREE_KEEP_OUT(x, y1)) addTree(x + rand() * 20, y1, 0.9 + rand() * 0.4, rand() < 0.3 ? 'tall' : 'round');
    const y2 = 1880 + rand() * 30;
    if (!TREE_KEEP_OUT(x, y2) && Math.abs(x - CX) > 170) addTree(x, y2, 0.8 + rand() * 0.3, 'round');
  }
  for (let y = 180; y < 1850; y += 100) {
    const xl = 75 + rand() * 30, xr = W - 75 - rand() * 30;
    if (!TREE_KEEP_OUT(xl, y)) addTree(xl, y, 0.9 + rand() * 0.35, rand() < 0.35 ? 'tall' : 'round');
    if (!TREE_KEEP_OUT(xr, y)) addTree(xr, y, 0.9 + rand() * 0.35, rand() < 0.35 ? 'tall' : 'round');
  }
  for (let i = 0; i < 260 && TREES.length < 115; i++) {
    const x = 120 + rand() * (W - 240), y = 200 + rand() * (H - 380);
    if (!TREE_KEEP_OUT(x, y)) addTree(x, y, 0.75 + rand() * 0.5, rand() < 0.25 ? 'tall' : 'round');
  }

  // ---------------------------------------------------------------- state
  const S = {
    mode: 'title', // title | intro | play | finale | end
    t: 0, lit: 0, collected: 0, paused: false,
    finaleT: -1, finished: false, revealShown: false,
    zone: null, zoneAt: -99, zoomMul: 0.78, active: null,
    traveled: 0,
  };
  const START = { x: CX, y: 1870 };
  const player = { x: START.x, y: START.y, face: 1, back: false, moving: false, speed: 255, step: 0, stuck: 0 };
  let target = null, pointerHeld = false, steerSign = 1;
  const cam = { x: CX, y: CY, zoom: 0.6 };
  const particles = [];
  const npcs = [];
  const motes = [];

  // ---------------------------------------------------------------- canvas setup
  const canvas = $('#game');
  const ctx = canvas.getContext('2d');
  const lightC = document.createElement('canvas');
  const lctx = lightC.getContext('2d');
  const LS = 0.5; // light-map resolution
  let VW = 0, VH = 0, DPR = 1, baseZoom = 1;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    VW = window.innerWidth; VH = window.innerHeight;
    canvas.width = Math.round(VW * DPR); canvas.height = Math.round(VH * DPR);
    lightC.width = Math.ceil(VW * LS); lightC.height = Math.ceil(VH * LS);
    baseZoom = clamp(Math.min(VW, VH * 1.35) / 860, 0.52, 1.15);
    sizeMinimap();
  }

  // ---------------------------------------------------------------- ground
  let ground = null;
  function buildGround() {
    const g = document.createElement('canvas');
    g.width = W; g.height = H;
    const c = g.getContext('2d');
    const r = makeRng(4242);

    const base = c.createLinearGradient(0, 0, W, H);
    base.addColorStop(0, '#1b4650'); base.addColorStop(0.5, '#1f5352'); base.addColorStop(1, '#1c4a47');
    c.fillStyle = base; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 240; i++) {
      const x = r() * W, y = r() * H, rad = 60 + r() * 180;
      const gr = c.createRadialGradient(x, y, 0, x, y, rad);
      const col = pick(['40,110,100', '22,60,70', '48,90,120', '30,85,75'], r);
      gr.addColorStop(0, `rgba(${col},0.35)`); gr.addColorStop(1, `rgba(${col},0)`);
      c.fillStyle = gr; c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    const blades = ['#2a6d63', '#17404a', '#2f7a6a', '#235e5a', '#35806e'];
    for (let i = 0; i < 14000; i++) {
      c.fillStyle = blades[i % blades.length];
      c.globalAlpha = 0.35 + r() * 0.5;
      c.fillRect(r() * W, r() * H, 1.4, 2 + r() * 3);
    }
    c.globalAlpha = 1;
    for (let i = 0; i < 380; i++) {
      c.fillStyle = pick(['#c084fc', '#f0abfc', '#fde68a', '#e9d5ff'], r);
      c.globalAlpha = 0.55;
      const x = r() * W, y = r() * H;
      if (onPath(x, y, 10)) continue;
      c.beginPath(); c.arc(x, y, 1.6 + r() * 1.2, 0, TAU); c.fill();
    }
    c.globalAlpha = 1;

    // Stone pattern
    const tile = document.createElement('canvas'); tile.width = 48; tile.height = 48;
    const tc = tile.getContext('2d');
    tc.fillStyle = '#6f6598'; tc.fillRect(0, 0, 48, 48);
    const bricks = [[0, 0, 24, 16], [24, 0, 24, 16], [-12, 16, 24, 16], [12, 16, 24, 16], [36, 16, 24, 16], [0, 32, 24, 16], [24, 32, 24, 16]];
    bricks.forEach(([x, y, w, h]) => {
      tc.fillStyle = pick(['#8c82b8', '#8479b0', '#9489c0', '#7e74aa'], r);
      tc.fillRect(x + 1, y + 1, w - 2, h - 2);
      tc.fillStyle = 'rgba(255,255,255,.07)'; tc.fillRect(x + 1, y + 1, w - 2, 2);
    });
    const stone = c.createPattern(tile, 'repeat');

    c.lineCap = 'round'; c.lineJoin = 'round';
    PATHS.forEach((p) => {
      c.beginPath(); p.pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.strokeStyle = 'rgba(10,20,30,.45)'; c.lineWidth = p.w + 16; c.stroke();
      c.strokeStyle = '#4b4378'; c.lineWidth = p.w + 8; c.stroke();
      c.strokeStyle = stone; c.lineWidth = p.w; c.stroke();
    });

    // Plaza
    c.save();
    c.beginPath(); c.arc(CX, CY, PLAZA.r + 10, 0, TAU); c.fillStyle = '#4b4378'; c.fill();
    c.beginPath(); c.arc(CX, CY, PLAZA.r, 0, TAU); c.fillStyle = stone; c.fill();
    c.clip();
    c.strokeStyle = 'rgba(40,30,80,.5)'; c.lineWidth = 2;
    for (let rad = 60; rad < PLAZA.r; rad += 42) { c.beginPath(); c.arc(CX, CY, rad, 0, TAU); c.stroke(); }
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      c.beginPath(); c.moveTo(CX + Math.cos(a) * 100, CY + Math.sin(a) * 100);
      c.lineTo(CX + Math.cos(a) * PLAZA.r, CY + Math.sin(a) * PLAZA.r); c.stroke();
    }
    // Mosaic ring
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * TAU;
      c.fillStyle = i % 2 ? '#7c3aed' : '#c4a1ff';
      c.globalAlpha = 0.7;
      c.save(); c.translate(CX + Math.cos(a) * 146, CY + Math.sin(a) * 146); c.rotate(a + Math.PI / 4);
      c.fillRect(-6, -6, 12, 12); c.restore();
    }
    c.globalAlpha = 1;
    // Compass star
    c.fillStyle = 'rgba(168,85,247,.55)';
    c.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU - Math.PI / 2, rad = i % 2 ? 108 : 132;
      const x = CX + Math.cos(a) * rad, y = CY + Math.sin(a) * rad;
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.closePath(); c.fill();
    c.restore();

    // Auditorium steps
    c.fillStyle = '#4b4378'; c.fillRect(STEPS.x - 6, STEPS.y, STEPS.w + 12, STEPS.h + 6);
    for (let i = 0; i < 5; i++) {
      c.fillStyle = i % 2 ? '#9a90c6' : '#8a80b8';
      c.fillRect(STEPS.x, STEPS.y + i * (STEPS.h / 5), STEPS.w, STEPS.h / 5);
      c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(STEPS.x, STEPS.y + i * (STEPS.h / 5), STEPS.w, 2);
    }
    // Purple carpet up the steps
    c.fillStyle = '#6d28d9'; c.fillRect(CX - 36, STEPS.y, 72, STEPS.h + 12);
    c.fillStyle = '#fbbf24'; c.fillRect(CX - 36, STEPS.y, 3, STEPS.h + 12); c.fillRect(CX + 33, STEPS.y, 3, STEPS.h + 12);

    // Patio deck
    c.fillStyle = 'rgba(10,10,30,.4)'; rr(c, PATIO.x - 6, PATIO.y - 2, PATIO.w + 12, PATIO.h + 14, 14); c.fill();
    c.fillStyle = '#5b3f63'; rr(c, PATIO.x, PATIO.y, PATIO.w, PATIO.h, 10); c.fill();
    c.save(); rr(c, PATIO.x, PATIO.y, PATIO.w, PATIO.h, 10); c.clip();
    for (let y = PATIO.y; y < PATIO.y + PATIO.h; y += 18) {
      c.fillStyle = r() < 0.5 ? '#664870' : '#6e4f78'; c.fillRect(PATIO.x, y + 1, PATIO.w, 16);
      for (let x = PATIO.x + r() * 80; x < PATIO.x + PATIO.w; x += 90 + r() * 60) { c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(x, y + 1, 2, 16); }
    }
    c.restore();

    // Track + field
    const T = TRACK;
    c.fillStyle = 'rgba(8,10,30,.45)'; rr(c, T.x - 10, T.y - 6, T.w + 20, T.h + 18, T.w / 2 + 10); c.fill();
    c.fillStyle = '#7a3561'; rr(c, T.x, T.y, T.w, T.h, T.w / 2); c.fill();
    c.strokeStyle = 'rgba(255,230,250,.35)'; c.lineWidth = 2;
    for (let i = 1; i < 5; i++) { rr(c, T.x + i * 13, T.y + i * 13, T.w - i * 26, T.h - i * 26, T.w / 2 - i * 13); c.stroke(); }
    const FI = { x: T.x + 70, y: T.y + 70, w: T.w - 140, h: T.h - 140 };
    c.save(); rr(c, FI.x, FI.y, FI.w, FI.h, FI.w / 2); c.fillStyle = '#23694d'; c.fill(); c.clip();
    for (let y = FI.y; y < FI.y + FI.h; y += 44) { c.fillStyle = ((y - FI.y) / 44) % 2 ? '#277555' : '#21654a'; c.fillRect(FI.x, y, FI.w, 44); }
    c.restore();
    c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 3;
    const px = 2090, py = 690, pw = 300, ph = 500;
    c.strokeRect(px, py, pw, ph);
    c.beginPath(); c.moveTo(px, py + ph / 2); c.lineTo(px + pw, py + ph / 2); c.stroke();
    c.beginPath(); c.arc(px + pw / 2, py + ph / 2, 56, 0, TAU); c.stroke();
    c.strokeRect(px + 70, py, pw - 140, 70); c.strokeRect(px + 70, py + ph - 70, pw - 140, 70);

    // Flower beds in front of classrooms
    [B.classW, B.classE, B.commons].forEach((b) => {
      const y = b.y + b.d + 4;
      c.fillStyle = '#2b1f3f'; rr(c, b.x + 10, y, b.w - 20, 14, 6); c.fill();
      for (let x = b.x + 18; x < b.x + b.w - 18; x += 7) {
        c.fillStyle = pick(['#c084fc', '#f0abfc', '#fde68a', '#a78bfa'], r);
        c.beginPath(); c.arc(x, y + 7 + (r() - 0.5) * 5, 2.4, 0, TAU); c.fill();
      }
    });

    // Contact shadows under buildings
    Object.values(B).forEach((b) => {
      const gr = c.createLinearGradient(0, b.y + b.d, 0, b.y + b.d + 34);
      gr.addColorStop(0, 'rgba(5,4,20,.55)'); gr.addColorStop(1, 'rgba(5,4,20,0)');
      c.fillStyle = gr; c.fillRect(b.x - 6, b.y + b.d, b.w + 24, 34);
      c.fillStyle = 'rgba(5,4,20,.35)'; c.fillRect(b.x + b.w, b.y + 10, 22, b.d);
    });

    // Soft edge of the world
    const eg = c.createRadialGradient(CX, CY, Math.min(W, H) * 0.45, CX, CY, Math.max(W, H) * 0.75);
    eg.addColorStop(0, 'rgba(8,6,28,0)'); eg.addColorStop(1, 'rgba(8,6,28,.55)');
    c.fillStyle = eg; c.fillRect(0, 0, W, H);
    ground = g;
  }

  // ---------------------------------------------------------------- draw helpers
  function vgrad(y0, y1, a, b) { const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g; }

  // A box resting at elevation z. Front face faces the viewer (south).
  function box(x, y, w, d, z, h, top, front, rim) {
    const fy = y + d - z;
    ctx.fillStyle = front; ctx.fillRect(x, fy - h, w, h);
    ctx.fillStyle = top; ctx.fillRect(x, y - z - h, w, d);
    if (rim) { ctx.fillStyle = rim; ctx.fillRect(x, fy - h - 1.5, w, 3); }
  }

  function winGlow(thr) {
    let v = 0;
    if (S.lit > 0) v = clamp((S.lit * 1.25 - thr) * 5, 0, 1);
    if (thr < 0.07) v = Math.max(v, 0.6 + 0.15 * Math.sin(S.t * 2 + thr * 90));
    return v;
  }
  function drawWindow(x, y, w, h, thr) {
    ctx.fillStyle = '#140f36'; ctx.fillRect(x, y, w, h);
    const on = winGlow(thr);
    if (on > 0.01) {
      ctx.globalAlpha = on;
      ctx.fillStyle = vgrad(y, y + h, '#ffe2a6', '#ffb45a'); ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = 'rgba(160,140,255,.14)';
      ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x + w * 0.5, y); ctx.lineTo(x + w * 0.8, y); ctx.lineTo(x + w * 0.3, y + h); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fillRect(x, y, w, 1.5);
  }

  function flicker(seed) {
    // mostly on, with the occasional stutter
    const v = Math.sin(S.t * 13 + seed) + Math.sin(S.t * 7.3 + seed * 2);
    return v > 1.75 ? 0.25 : 1;
  }

  // ---------------------------------------------------------------- buildings
  function drawAuditorium(p) {
    const { x, y, w, d, h } = B.aud, fy = y + d;
    ctx.fillStyle = vgrad(fy - h, fy, '#46329f', '#221858'); ctx.fillRect(x, fy - h, w, h);
    ctx.fillStyle = '#271d63'; ctx.fillRect(x, y - h, w, d);
    ctx.fillStyle = '#30257a'; ctx.fillRect(x + 12, y - h + 12, w - 24, d - 24);
    ctx.fillStyle = '#9b82ff'; ctx.fillRect(x, fy - h - 2, w, 4);
    // roof vents
    for (let i = 0; i < 3; i++) box(x + 60 + i * 60, y + 200, 36, 30, h, 12, '#3e3290', '#2b2170');
    box(x + w - 150, y + 190, 80, 40, h, 16, '#3e3290', '#2b2170');
    // fly tower
    box(x + w * 0.28, y + 22, w * 0.44, 140, h, 86, '#2d2275', vgrad(y + 162 - h - 86, y + 162 - h, '#43329c', '#2a1f6c'), '#b39cff');
    // fly tower emblem
    const ex = x + w / 2, ey = y + 162 - h - 43;
    ctx.save(); ctx.translate(ex, ey);
    ctx.fillStyle = S.lit > 0.5 ? '#ffd48a' : '#7b62e0';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU - Math.PI / 2, rad = i % 2 ? 9 : 22; ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); }
    ctx.closePath(); ctx.fill(); ctx.restore();

    // upper side windows
    let wi = 0;
    for (let i = 0; i < 4; i++) {
      drawWindow(x + 22 + i * 26, fy - h + 26, 14, 44, p.wins[wi++]);
      drawWindow(x + w - 36 - i * 26, fy - h + 26, 14, 44, p.wins[wi++]);
    }
    // hanging banners
    [x + 30, x + w - 58].forEach((bx, i) => {
      const sw = Math.sin(S.t * 1.6 + i) * 2;
      ctx.fillStyle = '#7c3aed';
      ctx.beginPath(); ctx.moveTo(bx, fy - h + 84); ctx.lineTo(bx + 28, fy - h + 84); ctx.lineTo(bx + 28 + sw, fy - 30); ctx.lineTo(bx + 14 + sw, fy - 40); ctx.lineTo(bx + sw, fy - 30); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fbbf24'; ctx.fillRect(bx, fy - h + 84, 28, 4);
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.beginPath(); ctx.arc(bx + 14 + sw * 0.5, fy - h + 118, 6, 0, TAU); ctx.fill();
    });
    // entablature + columns
    ctx.fillStyle = '#5a46c4'; ctx.fillRect(x + 110, fy - 152, w - 220, 14);
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(x + 110, fy - 152, w - 220, 2);
    // doors
    for (let i = 0; i < 5; i++) {
      const dx = x + 172 + i * 84;
      ctx.fillStyle = '#120b30'; ctx.fillRect(dx - 22, fy - 66, 44, 66);
      const on = winGlow(0.1 + i * 0.05);
      if (on > 0) { ctx.globalAlpha = on; ctx.fillStyle = vgrad(fy - 66, fy, '#ffcf7a', '#ff9f43'); ctx.fillRect(dx - 20, fy - 64, 40, 64); ctx.globalAlpha = 1; }
      ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.fillRect(dx - 1, fy - 64, 2, 64);
    }
    for (let i = 0; i < 6; i++) {
      const cx = x + 130 + i * 84;
      ctx.fillStyle = vgrad(fy - 138, fy, '#8d79f0', '#4c3aa6'); ctx.fillRect(cx - 10, fy - 138, 20, 138);
      ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(cx - 10, fy - 138, 4, 138);
      ctx.fillStyle = '#a48ff8'; ctx.fillRect(cx - 14, fy - 142, 28, 8); ctx.fillRect(cx - 13, fy - 6, 26, 6);
    }
    drawMarquee(x + w / 2, fy - 124);
  }

  function drawMarquee(cx, top) {
    const w = 330, h = 54, x = cx - w / 2;
    ctx.fillStyle = '#0f0a2c'; ctx.fillRect(x - 6, top - 6, w + 12, h + 12);
    ctx.fillStyle = '#1d1450'; ctx.fillRect(x, top, w, h);
    // chasing bulbs
    const n = 34, per = 2 * (w + h);
    for (let i = 0; i < n; i++) {
      let s = (i / n) * per, bx, by;
      if (s < w) { bx = x + s; by = top - 3; }
      else if (s < w + h) { bx = x + w + 3; by = top + (s - w); }
      else if (s < 2 * w + h) { bx = x + w - (s - w - h); by = top + h + 3; }
      else { bx = x - 3; by = top + h - (s - 2 * w - h); }
      const on = (i + Math.floor(S.t * (S.lit > 0.5 ? 10 : 4))) % 3 === 0;
      ctx.fillStyle = on ? '#fff3c4' : (S.lit > 0.5 ? '#f5b041' : '#6b5a3a');
      ctx.beginPath(); ctx.arc(bx, by, on ? 2.6 : 2, 0, TAU); ctx.fill();
    }
    const lit = S.lit > 0.4;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `700 11px ${FONT_D}`;
    ctx.fillStyle = lit ? '#e9d5ff' : '#9d8bd6';
    ctx.fillText(lit ? 'NOW SHOWING' : 'COMING SOON', cx, top + 16);
    ctx.font = `800 17px ${FONT_D}`;
    ctx.fillStyle = lit ? '#ffd48a' : '#c9a86a';
    ctx.fillText(lit ? 'ALL OF US' : `YOUR IDEAS · ${S.collected}/4`, cx, top + 37);
  }

  function drawStageDoor() {
    const { x, y, w, d, h } = B.stage, fy = y + d;
    ctx.fillStyle = vgrad(fy - h, fy, '#3b2b8a', '#1f1654'); ctx.fillRect(x, fy - h, w, h);
    ctx.fillStyle = '#261c60'; ctx.fillRect(x, y - h, w, d);
    ctx.fillStyle = '#8f73ff'; ctx.fillRect(x, fy - h - 1.5, w, 3);
    ctx.fillStyle = '#120b30'; ctx.fillRect(x + 40, fy - 58, 38, 58);
    ctx.fillStyle = '#2a1f6c'; ctx.fillRect(x + 43, fy - 55, 32, 55);
    ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(x + 70, fy - 28, 2, 0, TAU); ctx.fill();
    // sign
    ctx.fillStyle = '#0f0a2c'; ctx.fillRect(x + 18, fy - 86, 82, 20);
    ctx.fillStyle = '#e9d5ff'; ctx.font = `700 9px ${FONT_D}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('STAGE DOOR', x + 59, fy - 76);
    ctx.fillStyle = 'rgba(214,200,245,.7)'; ctx.font = `600 8px ${FONT_B}`;
    ctx.fillText('(knock twice)', x + 59, fy - 62 - 0);
    // bulb above the door
    ctx.fillStyle = '#ffe3a3'; ctx.beginPath(); ctx.arc(x + 59, fy - 96, 3, 0, TAU); ctx.fill();
  }

  function drawCommons(p) {
    const { x, y, w, d, h } = B.commons, fy = y + d;
    ctx.fillStyle = vgrad(fy - h, fy, '#4a358f', '#261a5c'); ctx.fillRect(x, fy - h, w, h);
    ctx.fillStyle = '#2b2068'; ctx.fillRect(x, y - h, w, d);
    ctx.fillStyle = '#35297c'; ctx.fillRect(x + 10, y - h + 10, w - 20, d - 20);
    box(x + 60, y + 150, 60, 34, h, 14, '#40348f', '#2b2170');
    box(x + 300, y + 140, 90, 44, h, 18, '#40348f', '#2b2170');
    ctx.fillStyle = '#9b82ff'; ctx.fillRect(x, fy - h - 1.5, w, 3);
    // glass wall
    const gx = x + 18, gy = fy - 92, gw = w - 36, gh = 84;
    const on = winGlow(0.18);
    ctx.fillStyle = '#130e34'; ctx.fillRect(gx, gy, gw, gh);
    if (on > 0) {
      ctx.globalAlpha = on; ctx.fillStyle = vgrad(gy, gy + gh, '#ffe2a6', '#f59e0b'); ctx.fillRect(gx, gy, gw, gh); ctx.globalAlpha = 1;
      // silhouettes of tables and lamps inside
      ctx.fillStyle = `rgba(80,40,60,${0.45 * on})`;
      for (let i = 0; i < 6; i++) { ctx.fillRect(gx + 30 + i * 68, gy + gh - 26, 36, 5); ctx.fillRect(gx + 46 + i * 68, gy + gh - 21, 4, 21); }
      ctx.fillStyle = `rgba(255,255,255,${0.5 * on})`;
      for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(gx + 48 + i * 68, gy + 14, 4, 0, TAU); ctx.fill(); }
    } else {
      ctx.fillStyle = 'rgba(170,150,255,.12)';
      for (let i = 0; i < 4; i++) { const sx = gx + 30 + i * 110; ctx.beginPath(); ctx.moveTo(sx, gy + gh); ctx.lineTo(sx + 40, gy); ctx.lineTo(sx + 70, gy); ctx.lineTo(sx + 30, gy + gh); ctx.fill(); }
    }
    ctx.fillStyle = '#2b2068';
    for (let mx = gx; mx <= gx + gw; mx += gw / 8) ctx.fillRect(mx - 1.5, gy, 3, gh);
    ctx.fillRect(gx, gy + 30, gw, 3);
    // door
    ctx.fillStyle = '#0e0928'; ctx.fillRect(x + w / 2 - 22, fy - 62, 44, 62);
    if (on > 0) { ctx.globalAlpha = on; ctx.fillStyle = '#ffc56b'; ctx.fillRect(x + w / 2 - 20, fy - 60, 40, 60); ctx.globalAlpha = 1; }
    ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(x + w / 2 - 1, fy - 60, 2, 60);
    // striped awning
    const ay = fy - 102, ah = 22;
    const n = 14, sw = (w - 8) / n;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i % 2 ? '#f3e8ff' : '#9333ea';
      ctx.beginPath();
      ctx.moveTo(x + 4 + i * sw, ay); ctx.lineTo(x + 4 + (i + 1) * sw, ay);
      ctx.lineTo(x + 4 + (i + 1) * sw, ay + ah); ctx.quadraticCurveTo(x + 4 + (i + 0.5) * sw, ay + ah + 8, x + 4 + i * sw, ay + ah);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(x + 4, ay, w - 8, 5);
    // neon sign on the roof edge
    const nx = x + w / 2, ny = fy - h - 22;
    ctx.fillStyle = '#0d0826'; rr(ctx, nx - 104, ny - 17, 208, 32, 8); ctx.fill();
    ctx.fillStyle = '#3a2d7a'; ctx.fillRect(nx - 70, ny + 15, 4, 8); ctx.fillRect(nx + 66, ny + 15, 4, 8);
    const f = S.lit > 0.5 ? 1 : flicker(3.1);
    ctx.font = `800 16px ${FONT_D}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.save();
    ctx.shadowColor = '#f0abfc'; ctx.shadowBlur = 16 * f;
    ctx.fillStyle = f > 0.5 ? '#fdf4ff' : '#6b4a7a';
    ctx.fillText('THE COMMONS', nx, ny);
    ctx.restore();
    if (S.lit > 0.5) {
      ctx.fillStyle = '#fbbf24'; ctx.font = `800 9px ${FONT_D}`;
      ctx.fillText('● OPEN', nx + 140, ny + 2);
    }
  }

  function drawTower() {
    const { x, y, w, d, h } = B.tower, fy = y + d;
    ctx.fillStyle = vgrad(fy - h, fy, '#4a38a0', '#211757'); ctx.fillRect(x, fy - h, w, h);
    ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(x, fy - h, 10, h);
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(x + w - 12, fy - h, 12, h);
    ctx.fillStyle = '#2d2275'; ctx.fillRect(x, y - h, w, d);
    // pyramid roof
    const top = y - h;
    ctx.fillStyle = '#5b3fc8';
    ctx.beginPath(); ctx.moveTo(x - 8, fy - h); ctx.lineTo(x + w / 2, top - 90); ctx.lineTo(x + w + 8, fy - h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3d2a96';
    ctx.beginPath(); ctx.moveTo(x + w / 2, top - 90); ctx.lineTo(x + w + 8, fy - h); ctx.lineTo(x + w / 2 + 12, fy - h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fbbf24'; ctx.fillRect(x + w / 2 - 1.5, top - 110, 3, 22);
    ctx.beginPath(); ctx.moveTo(x + w / 2 + 1.5, top - 110); ctx.lineTo(x + w / 2 + 16, top - 104); ctx.lineTo(x + w / 2 + 1.5, top - 98); ctx.fill();
    // clock
    const cx = x + w / 2, cy = fy - h + 52;
    const lit = S.lit > 0.3;
    ctx.fillStyle = '#1a1244'; ctx.beginPath(); ctx.arc(cx, cy, 33, 0, TAU); ctx.fill();
    ctx.fillStyle = lit ? '#fff4d6' : '#cfc6ef'; ctx.beginPath(); ctx.arc(cx, cy, 28, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2a1f6c';
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; ctx.fillRect(cx + Math.cos(a) * 23 - 1.5, cy + Math.sin(a) * 23 - 1.5, 3, 3); }
    const now = new Date();
    const hr = ((now.getHours() % 12) + now.getMinutes() / 60) / 12 * TAU - Math.PI / 2;
    const mn = (now.getMinutes() + now.getSeconds() / 60) / 60 * TAU - Math.PI / 2;
    ctx.strokeStyle = '#1a1244'; ctx.lineCap = 'round';
    ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(hr) * 13, cy + Math.sin(hr) * 13); ctx.stroke();
    ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(mn) * 20, cy + Math.sin(mn) * 20); ctx.stroke();
    ctx.fillStyle = '#a855f7'; ctx.beginPath(); ctx.arc(cx, cy, 3, 0, TAU); ctx.fill();
    // belfry + windows
    ctx.fillStyle = '#120b30'; rr(ctx, cx - 16, fy - h + 100, 32, 40, 14); ctx.fill();
    drawWindow(x + 22, fy - 120, 16, 30, 0.3); drawWindow(x + w - 38, fy - 120, 16, 30, 0.35);
    drawWindow(x + 22, fy - 70, 16, 30, 0.4); drawWindow(x + w - 38, fy - 70, 16, 30, 0.04);
    ctx.fillStyle = '#9b82ff'; ctx.fillRect(x, fy - h - 1.5, w, 3);
  }

  function drawClassroom(p) {
    const { x, y, w, d, h } = p.b, fy = y + d;
    ctx.fillStyle = vgrad(fy - h, fy, '#4c3f94', '#2a2064'); ctx.fillRect(x, fy - h, w, h);
    ctx.fillStyle = '#2a2069'; ctx.fillRect(x, y - h, w, d);
    ctx.fillStyle = '#332783'; ctx.fillRect(x + 10, y - h + 10, w - 20, d - 20);
    box(x + 50, y + 120, 50, 30, h, 14, '#40348f', '#2b2170');
    box(x + w - 130, y + 100, 70, 40, h, 18, '#40348f', '#2b2170');
    ctx.fillStyle = '#8f73ff'; ctx.fillRect(x, fy - h - 1.5, w, 3);
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(x, fy - 62, w, 3);
    let k = 0;
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 12; i++) {
        const wx = x + 16 + i * 37;
        if (row === 1 && (i === 5 || i === 6)) continue;
        drawWindow(wx, fy - h + 16 + row * 56, 24, 34, p.wins[k++]);
      }
    }
    // door
    const dx = x + w / 2;
    ctx.fillStyle = '#100a2c'; ctx.fillRect(dx - 26, fy - 52, 52, 52);
    const on = winGlow(0.25);
    if (on > 0) { ctx.globalAlpha = on; ctx.fillStyle = '#ffcf7a'; ctx.fillRect(dx - 24, fy - 50, 48, 50); ctx.globalAlpha = 1; }
    ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.fillRect(dx - 1, fy - 50, 2, 50);
    ctx.fillStyle = '#0f0a2c'; ctx.fillRect(dx - 44, fy - 70, 88, 14);
    ctx.fillStyle = '#d8c8ff'; ctx.font = `700 8px ${FONT_D}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(p.label.toUpperCase(), dx, fy - 63);
  }

  function drawFountain() {
    const x = CX, y = CY, t = S.t;
    // basin
    ctx.fillStyle = 'rgba(5,4,20,.4)'; ctx.beginPath(); ctx.ellipse(x + 6, y + 10, 92, 30, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#5b5192'; ctx.beginPath(); ctx.arc(x, y - 14, 86, 0, TAU); ctx.fill();
    ctx.fillStyle = '#463c7e'; ctx.fillRect(x - 86, y - 14, 172, 16);
    ctx.beginPath(); ctx.arc(x, y + 2, 86, 0, Math.PI); ctx.fill();
    ctx.fillStyle = '#8c82c2'; ctx.beginPath(); ctx.arc(x, y - 14, 86, 0, TAU); ctx.lineWidth = 5; ctx.strokeStyle = '#a79de0'; ctx.stroke();
    // water
    const lit = S.lit;
    const wg = ctx.createRadialGradient(x, y - 14, 10, x, y - 14, 76);
    wg.addColorStop(0, lit > 0.3 ? '#8fd3ff' : '#4a4fb5'); wg.addColorStop(1, lit > 0.3 ? '#5b5fe0' : '#27236e');
    ctx.fillStyle = wg; ctx.beginPath(); ctx.arc(x, y - 14, 76, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const rr2 = Math.max(0, (t * 22 + i * 25) % 75);
      ctx.globalAlpha = 1 - rr2 / 75;
      ctx.beginPath(); ctx.arc(x, y - 14, rr2, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // pillar + bowl
    ctx.fillStyle = '#6e63a8'; ctx.fillRect(x - 10, y - 64, 20, 50);
    ctx.fillStyle = '#a79de0'; ctx.beginPath(); ctx.ellipse(x, y - 64, 34, 11, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#5b5192'; ctx.beginPath(); ctx.ellipse(x, y - 62, 34, 11, 0, 0, Math.PI); ctx.fill();
    ctx.fillStyle = lit > 0.3 ? '#8fd3ff' : '#4a4fb5'; ctx.beginPath(); ctx.ellipse(x, y - 65, 28, 8, 0, 0, TAU); ctx.fill();
    // jets
    const jets = reduceMotion ? 8 : 16;
    for (let i = 0; i < jets; i++) {
      const a = (i / jets) * TAU;
      const ph = (t * 1.1 + i * 0.37) % 1;
      const dx = Math.cos(a) * 30 * ph, dy = Math.sin(a) * 10 * ph;
      const hgt = 34 * Math.sin(ph * Math.PI);
      ctx.fillStyle = `rgba(200,225,255,${0.8 - ph * 0.6})`;
      ctx.beginPath(); ctx.arc(x + dx, y - 66 + dy - hgt, 2, 0, TAU); ctx.fill();
    }
    const ph = (t * 2) % 1;
    ctx.fillStyle = 'rgba(220,235,255,.8)';
    ctx.fillRect(x - 1.5, y - 100, 3, 34);
    ctx.beginPath(); ctx.arc(x, y - 100 - Math.sin(ph * Math.PI) * 4, 3.5, 0, TAU); ctx.fill();
  }

  // ---------------------------------------------------------------- props draw
  function drawTree(p) {
    const tr = p.tree, s = tr.s, x = tr.x, y = tr.y;
    const sway = reduceMotion ? 0 : Math.sin(S.t * 0.9 + tr.ph) * 2 * s;
    ctx.fillStyle = 'rgba(5,4,20,.38)'; ctx.beginPath(); ctx.ellipse(x + 8 * s, y + 2, 34 * s, 11 * s, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3a2548'; ctx.fillRect(x - 4 * s, y - 34 * s, 8 * s, 34 * s);
    const tones = [['#16384a', '#205557', '#2f7466', '#8b6cf0'], ['#1a3350', '#244a63', '#35697a', '#a78bfa'], ['#1b3a3f', '#27584f', '#3a7a62', '#c084fc']][tr.tone];
    if (S.lit > 0.2) {
      // richer greens once the campus wakes up
      const k = clamp((S.lit - 0.2) / 0.8, 0, 1);
      tones[2] = mix(tones[2], '#4a9a6e', k);
    }
    if (tr.kind === 'tall') {
      const cx = x + sway;
      ctx.fillStyle = tones[0]; ctx.beginPath(); ctx.ellipse(cx, y - 72 * s, 22 * s, 58 * s, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = tones[1]; ctx.beginPath(); ctx.ellipse(cx - 4 * s, y - 80 * s, 16 * s, 46 * s, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = tones[2]; ctx.beginPath(); ctx.ellipse(cx - 7 * s, y - 92 * s, 8 * s, 26 * s, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = tones[3]; ctx.globalAlpha = 0.5; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(cx, y - 72 * s, 22 * s, 58 * s, 0, Math.PI * 1.1, Math.PI * 1.6); ctx.stroke(); ctx.globalAlpha = 1;
    } else {
      const cx = x + sway;
      const blobs = [[0, -62, 36], [-24, -48, 25], [24, -50, 27], [0, -86, 26], [-16, -74, 22], [18, -76, 22]];
      ctx.fillStyle = tones[0];
      blobs.forEach(([bx, by, br]) => { ctx.beginPath(); ctx.arc(cx + bx * s, y + by * s, br * s, 0, TAU); ctx.fill(); });
      ctx.fillStyle = tones[1];
      blobs.forEach(([bx, by, br]) => { ctx.beginPath(); ctx.arc(cx + (bx - 4) * s, y + (by - 6) * s, br * 0.78 * s, 0, TAU); ctx.fill(); });
      ctx.fillStyle = tones[2];
      [[-8, -92, 13], [-26, -58, 10], [12, -80, 10]].forEach(([bx, by, br]) => { ctx.beginPath(); ctx.arc(cx + bx * s, y + by * s, br * s, 0, TAU); ctx.fill(); });
      ctx.strokeStyle = tones[3]; ctx.globalAlpha = 0.45; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, y - 86 * s, 26 * s, Math.PI * 1.05, Math.PI * 1.55); ctx.stroke(); ctx.globalAlpha = 1;
    }
  }

  function drawLamp(p) {
    const l = p.lamp, x = l.x, y = l.y, lv = l.level;
    ctx.fillStyle = 'rgba(5,4,20,.35)'; ctx.beginPath(); ctx.ellipse(x + 3, y + 1, 9, 3.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1c1545'; ctx.fillRect(x - 5, y - 6, 10, 6);
    ctx.fillStyle = '#2a2266'; ctx.fillRect(x - 1.8, y - 66, 3.6, 62);
    ctx.fillStyle = '#3b3190'; ctx.fillRect(x - 8, y - 70, 16, 4);
    ctx.fillStyle = mix('#3a3572', '#fff1c9', lv); ctx.fillRect(x - 6, y - 82, 12, 12);
    ctx.fillStyle = '#2a2266'; ctx.beginPath(); ctx.moveTo(x - 9, y - 82); ctx.lineTo(x, y - 90); ctx.lineTo(x + 9, y - 82); ctx.fill();
  }

  function drawBench(p) {
    const x = p.bx, y = p.y - 8;
    ctx.fillStyle = 'rgba(5,4,20,.35)'; ctx.fillRect(x - 28, y + 6, 60, 6);
    ctx.fillStyle = '#2a1f5e'; ctx.fillRect(x - 24, y - 4, 4, 12); ctx.fillRect(x + 20, y - 4, 4, 12);
    ctx.fillStyle = '#8a5a3c'; ctx.fillRect(x - 28, y - 22, 56, 5); ctx.fillRect(x - 28, y - 15, 56, 5);
    ctx.fillStyle = '#b07a52'; ctx.fillRect(x - 28, y - 8, 56, 6);
  }

  function drawTable(p) {
    const x = p.tx, y = p.ty;
    ctx.fillStyle = 'rgba(5,4,20,.35)'; ctx.beginPath(); ctx.ellipse(x + 6, y + 6, 32, 12, 0, 0, TAU); ctx.fill();
    // chairs
    ctx.fillStyle = '#3b2d7e';
    [[-30, 0], [30, 0], [0, 16]].forEach(([dx, dy]) => ctx.fillRect(x + dx - 6, y + dy - 14, 12, 14));
    ctx.fillStyle = '#e9e1ff'; ctx.beginPath(); ctx.ellipse(x, y - 22, 20, 9, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#b9aee0'; ctx.fillRect(x - 20, y - 22, 40, 3);
    ctx.fillStyle = '#2a2266'; ctx.fillRect(x - 1.5, y - 76, 3, 56);
    // umbrella
    const cy = y - 78, rx = 40, ry = 16, n = 8;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU;
      ctx.fillStyle = p.col[i % 2];
      ctx.beginPath(); ctx.moveTo(x, cy - 8);
      ctx.lineTo(x + Math.cos(a0) * rx, cy + Math.sin(a0) * ry);
      ctx.lineTo(x + Math.cos(a1) * rx, cy + Math.sin(a1) * ry);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    ctx.beginPath(); ctx.ellipse(x, cy + 1, rx, ry, 0, 0, Math.PI); ctx.lineTo(x - rx, cy); ctx.fill();
    ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(x, cy - 9, 2.5, 0, TAU); ctx.fill();
  }

  function drawPole(p) {
    ctx.fillStyle = '#2a2266'; ctx.fillRect(p.x - 2, p.y - 96, 4, 96);
    ctx.fillStyle = '#4a3fa0'; ctx.beginPath(); ctx.arc(p.x, p.y - 96, 4, 0, TAU); ctx.fill();
  }

  function drawTier(p) {
    const k = p.k, y = p.ty, h = p.th;
    box(BLEACH.x, y, BLEACH.w, 24, 0, h, k % 2 ? '#7d6ae6' : '#8f7cf2', vgrad(y + 24 - h, y + 24, '#4b3aa8', '#2d2270'), '#b5a4ff');
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    for (let i = 1; i < 8; i++) ctx.fillRect(BLEACH.x + i * 55, y + 24 - h, 2, h);
  }

  function drawScoreboard() {
    const x = 2150, w = 190, top = 388 - 175, h = 86;
    ctx.fillStyle = '#231a5e'; ctx.fillRect(2170, top + h, 8, 175 - h); ctx.fillRect(2312, top + h, 8, 175 - h);
    ctx.fillStyle = '#0c0724'; rr(ctx, x - 6, top - 6, w + 12, h + 12, 6); ctx.fill();
    ctx.fillStyle = '#150d3a'; ctx.fillRect(x, top, w, h);
    ctx.strokeStyle = '#7c3aed'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, top + 1, w - 2, h - 2);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `700 9px ${FONT_D}`; ctx.fillStyle = '#c4b5fd';
    const done = S.lit > 0.4;
    ctx.fillText(done ? 'HOME TEAM' : 'IDEAS FOUND', x + w / 2, top + 15);
    ctx.font = `800 30px ${FONT_D}`;
    ctx.save();
    ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffd166';
    const blink = Math.floor(S.t * 2) % 2 === 0;
    ctx.fillText(done ? 'EVERYONE' : `${S.collected}${blink ? ':' : ' '}4`, x + w / 2, top + 48);
    ctx.restore();
    ctx.font = `600 8px ${FONT_D}`; ctx.fillStyle = '#8b7fc0';
    ctx.fillText(done ? 'ALL GRADES · ALL IN' : 'GAME ON', x + w / 2, top + 74);
  }

  function drawGoal(p) {
    const x = p.x, y = p.y, w = 100, h = 42;
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.lineTo(x - w / 2, y - h); ctx.lineTo(x + w / 2, y - h); ctx.lineTo(x + w / 2, y); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.lineWidth = 1;
    for (let i = 1; i < 10; i++) { ctx.beginPath(); ctx.moveTo(x - w / 2 + i * 10, y - h); ctx.lineTo(x - w / 2 + i * 10, y - h - 14 * p.dir + 14 * (p.dir < 0)); ctx.stroke(); }
  }

  function drawGate() {
    const t = S.t;
    const pil = (x) => box(x, 1932, 34, 30, 0, 128, '#5b4bc0', vgrad(1962 - 128, 1962, '#5a47c2', '#2c2275'), '#b5a4ff');
    pil(1205); pil(1361);
    // arch banner
    const y = 1962 - 150;
    ctx.fillStyle = '#1a1244'; rr(ctx, 1200, y - 18, 200, 40, 10); ctx.fill();
    ctx.strokeStyle = '#a855f7'; ctx.lineWidth = 2; rr(ctx, 1200, y - 18, 200, 40, 10); ctx.stroke();
    ctx.font = `800 15px ${FONT_D}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.save(); ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 10 + Math.sin(t * 2) * 4;
    ctx.fillStyle = '#ffd48a'; ctx.fillText('WELCOME IN', CX, y + 2); ctx.restore();
    // pillar lanterns
    [1222, 1378].forEach((lx) => { ctx.fillStyle = '#fff1c9'; ctx.beginPath(); ctx.arc(lx, 1962 - 140, 5, 0, TAU); ctx.fill(); });
  }

  function drawFence() {
    const y = 1968;
    [[40, 1200], [1400, W - 40]].forEach(([a, b]) => {
      ctx.fillStyle = '#2a2066'; ctx.fillRect(a, y - 30, b - a, 4); ctx.fillRect(a, y - 12, b - a, 4);
      ctx.fillStyle = '#3a2d8a';
      for (let x = a; x < b; x += 14) ctx.fillRect(x, y - 36, 3, 36);
    });
  }

  // ---------------------------------------------------------------- characters
  function drawFigure(x, y, z, o) {
    const s = o.s || 1, bob = o.bob || 0;
    ctx.fillStyle = 'rgba(5,4,20,.4)'; ctx.beginPath(); ctx.ellipse(x, y, 11 * s, 4 * s, 0, 0, TAU); ctx.fill();
    const by = y - z - bob;
    // legs
    ctx.fillStyle = o.legs || '#1e1b4b';
    const sw = o.walk ? Math.sin(o.walk) * 3 : 0;
    ctx.fillRect(x - 5 * s + sw * 0.5, by - 10 * s, 4 * s, 10 * s);
    ctx.fillRect(x + 1 * s - sw * 0.5, by - 10 * s, 4 * s, 10 * s);
    // body
    ctx.fillStyle = o.body; rr(ctx, x - 8 * s, by - 28 * s, 16 * s, 20 * s, 6 * s); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(x - 6 * s, by - 26 * s, 3 * s, 14 * s);
    // head
    ctx.fillStyle = o.head; ctx.beginPath(); ctx.arc(x, by - 35 * s, 7.5 * s, 0, TAU); ctx.fill();
    ctx.fillStyle = o.hair; ctx.beginPath(); ctx.arc(x, by - 37 * s, 7.8 * s, Math.PI, TAU); ctx.fill();
    if (o.cheer) {
      ctx.strokeStyle = o.body; ctx.lineWidth = 3 * s; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - 7 * s, by - 24 * s); ctx.lineTo(x - 12 * s, by - 38 * s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 7 * s, by - 24 * s); ctx.lineTo(x + 12 * s, by - 38 * s); ctx.stroke();
    }
  }

  function drawPlayer() {
    const x = player.x, y = player.y, t = S.t;
    const bob = player.moving ? Math.abs(Math.sin(player.step * 2)) * 3 : Math.sin(t * 2.4) * 1.2;
    // ground ring
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const rg = ctx.createRadialGradient(x, y, 0, x, y, 40);
    rg.addColorStop(0, 'rgba(168,85,247,.55)'); rg.addColorStop(1, 'rgba(168,85,247,0)');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.ellipse(x, y, 40, 16, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(216,180,254,${0.5 + Math.sin(t * 3) * 0.2})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, y, 20 + Math.sin(t * 3) * 2, 7, 0, 0, TAU); ctx.stroke();
    ctx.restore();

    const by = y - 6 - bob;
    // cape / scarf trail
    const f = player.face;
    ctx.fillStyle = '#fbbf24';
    const flow = player.moving ? 8 : 3;
    ctx.beginPath(); ctx.moveTo(x - 6 * f, by - 30); ctx.quadraticCurveTo(x - (14 + flow) * f, by - 26 + Math.sin(t * 8) * 2, x - (18 + flow) * f, by - 18 + Math.sin(t * 7) * 3);
    ctx.lineTo(x - 10 * f, by - 24); ctx.closePath(); ctx.fill();
    // legs
    ctx.fillStyle = '#1b1147';
    const sw = player.moving ? Math.sin(player.step * 2) * 4 : 0;
    rr(ctx, x - 7 + sw * 0.4, by - 10, 5, 12, 2); ctx.fill();
    rr(ctx, x + 2 - sw * 0.4, by - 10, 5, 12, 2); ctx.fill();
    // body capsule
    const g = ctx.createLinearGradient(x - 12, by - 44, x + 12, by);
    g.addColorStop(0, '#c4a1ff'); g.addColorStop(0.5, '#8b5cf6'); g.addColorStop(1, '#5b21b6');
    ctx.fillStyle = g; rr(ctx, x - 12, by - 46, 24, 40, 12); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.5; rr(ctx, x - 12, by - 46, 24, 40, 12); ctx.stroke();
    if (player.back) {
      // backpack
      ctx.fillStyle = '#3b1d8f'; rr(ctx, x - 9, by - 36, 18, 20, 5); ctx.fill();
      ctx.fillStyle = '#fbbf24'; ctx.fillRect(x - 9, by - 28, 18, 3);
    } else {
      // glowing visor (no face)
      ctx.save();
      ctx.shadowColor = '#e0f2fe'; ctx.shadowBlur = 12;
      ctx.fillStyle = '#f0f9ff';
      rr(ctx, x - 8 + f * 2.5, by - 38, 16, 7, 3.5); ctx.fill();
      ctx.restore();
      ctx.fillStyle = 'rgba(124,58,237,.6)'; ctx.fillRect(x - 4 + f * 3, by - 36, 5, 3);
    }
    // antenna spark
    ctx.strokeStyle = '#d8b4fe'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, by - 46); ctx.lineTo(x + 3 * f, by - 54); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + 3 * f, by - 56, 3, 0, TAU); ctx.fill();

    // orbiting idea spark
    const oa = t * 2.6;
    const ox = x + Math.cos(oa) * 24, oy = by - 30 + Math.sin(oa) * 9;
    const behind = Math.sin(oa) < 0;
    player.spark = { x: ox, y: oy, behind };
  }
  function drawSpark() {
    const sp = player.spark; if (!sp) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, 14);
    g.addColorStop(0, 'rgba(255,230,160,1)'); g.addColorStop(0.3, 'rgba(251,191,36,.6)'); g.addColorStop(1, 'rgba(251,191,36,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sp.x, sp.y, 14, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------- fragments
  function drawGemShape(x, y, r, spin, hue) {
    const w = Math.max(0.18, Math.abs(spin));
    const top = y - r * 1.3, bot = y + r * 1.3, mid = y - r * 0.25;
    const lx = x - r * w, rx = x + r * w;
    const light = spin > 0;
    ctx.fillStyle = hue;
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(rx, mid); ctx.lineTo(x, bot); ctx.lineTo(lx, mid); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(light ? rx : lx, mid); ctx.lineTo(x, mid + r * 0.15); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(light ? lx : rx, mid); ctx.lineTo(x, mid + r * 0.15); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,30,.28)'; ctx.beginPath(); ctx.moveTo(x, bot); ctx.lineTo(light ? lx : rx, mid); ctx.lineTo(x, mid + r * 0.15); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(rx, mid); ctx.lineTo(x, bot); ctx.lineTo(lx, mid); ctx.closePath(); ctx.stroke();
  }

  function drawFragment(p) {
    const f = p.frag; if (f.collected) return;
    const t = S.t, x = f.x, y = f.y;
    const bob = Math.sin(t * 2 + f.id) * 6;
    const near = clamp(1 - (Math.hypot(player.x - x, player.y - y) - 60) / 240, 0, 1);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // ground pool
    const pr = 60 + near * 20;
    const g = ctx.createRadialGradient(x, y, 0, x, y, pr);
    g.addColorStop(0, hexA(f.hue, 0.55)); g.addColorStop(1, hexA(f.hue, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, pr, pr * 0.4, 0, 0, TAU); ctx.fill();
    // expanding ring
    const ph = (t * 0.8 + f.id * 0.25) % 1;
    ctx.strokeStyle = hexA(f.hue, 0.7 * (1 - ph)); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, y, 16 + ph * 60, (16 + ph * 60) * 0.4, 0, 0, TAU); ctx.stroke();
    // light beam
    const bh = 460;
    const bg = ctx.createLinearGradient(0, y - bh, 0, y);
    bg.addColorStop(0, hexA(f.hue, 0)); bg.addColorStop(0.7, hexA(f.hue, 0.18)); bg.addColorStop(1, hexA(f.hue, 0.4));
    ctx.fillStyle = bg;
    const bw = 16 + Math.sin(t * 3 + f.id) * 3;
    ctx.beginPath(); ctx.moveTo(x - bw, y); ctx.lineTo(x - bw * 0.4, y - bh); ctx.lineTo(x + bw * 0.4, y - bh); ctx.lineTo(x + bw, y); ctx.closePath(); ctx.fill();
    // gem halo
    const gy = y - 44 - bob;
    const hg = ctx.createRadialGradient(x, gy, 0, x, gy, 46);
    hg.addColorStop(0, hexA(f.hue, 0.8)); hg.addColorStop(1, hexA(f.hue, 0));
    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(x, gy, 46, 0, TAU); ctx.fill();
    ctx.restore();
    drawGemShape(x, gy, 15 + near * 3, Math.cos(t * 1.8 + f.id), f.hue);
    // orbiting sparkles
    for (let i = 0; i < 3; i++) {
      const a = t * 2.2 + (i / 3) * TAU;
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5 + i);
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * 28, gy + Math.sin(a) * 10, 2, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // "?" prompt when you're getting close
    if (near > 0.05 && S.mode === 'play') {
      ctx.globalAlpha = near;
      ctx.fillStyle = 'rgba(15,8,40,.8)'; rr(ctx, x - 13, gy - 58, 26, 22, 8); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = `800 13px ${FONT_D}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('?', x, gy - 46);
      ctx.globalAlpha = 1;
    }
  }
  FRAGS.forEach((f) => prop(f.x, f.y, drawFragment, { frag: f }));

  // ---------------------------------------------------------------- color helpers
  function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  const rgbCache = {};
  function hexA(h, a) { const c = rgbCache[h] || (rgbCache[h] = hexToRgb(h)); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
  function mix(a, b, t) {
    const A = rgbCache[a] || (rgbCache[a] = hexToRgb(a)), Bc = rgbCache[b] || (rgbCache[b] = hexToRgb(b));
    return `rgb(${Math.round(lerp(A[0], Bc[0], t))},${Math.round(lerp(A[1], Bc[1], t))},${Math.round(lerp(A[2], Bc[2], t))})`;
  }

  // ---------------------------------------------------------------- overhead strings
  function catenary(a, b, za, zb, sag, n, fn) {
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = lerp(a[0], b[0], t), y = lerp(a[1], b[1], t);
      const z = lerp(za, zb, t) - Math.sin(t * Math.PI) * sag;
      fn(x, y - z, t, i);
    }
  }
  function drawOverhead() {
    const lit = S.lit;
    // patio string lights
    STRINGS.forEach((s, si) => {
      ctx.strokeStyle = 'rgba(20,14,50,.9)'; ctx.lineWidth = 1.2; ctx.beginPath();
      catenary(s.a, s.b, 94, 94, 26, 16, (x, y, t, i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      catenary(s.a, s.b, 94, 94, 26, 16, (x, y, t, i) => {
        if (i === 0 || i === 16) return;
        const on = lit > 0 ? clamp(lit * 1.4 - ((i + si * 3) % 7) / 10, 0, 1) : 0;
        ctx.fillStyle = on > 0 ? mix('#4b4380', '#fff1c9', on) : '#4b4380';
        ctx.beginPath(); ctx.arc(x, y + 3, 3, 0, TAU); ctx.fill();
        if (on > 0.2) {
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = `rgba(255,190,90,${0.35 * on})`;
          ctx.beginPath(); ctx.arc(x, y + 3, 9, 0, TAU); ctx.fill(); ctx.restore();
        }
      });
    });
    // courtyard bunting appears when the campus wakes up
    if (lit > 0.15) {
      const a = clamp((lit - 0.15) / 0.5, 0, 1);
      const cols = ['#a855f7', '#fbbf24', '#f0abfc', '#ffffff', '#7c3aed'];
      ctx.globalAlpha = a;
      BUNTING.forEach((s, si) => {
        const A = [s.a.x, s.a.y], Bp = [s.b.x, s.b.y];
        ctx.strokeStyle = 'rgba(30,20,70,.8)'; ctx.lineWidth = 1; ctx.beginPath();
        catenary(A, Bp, 86, 86, 30, 24, (x, y, t, i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
        catenary(A, Bp, 86, 86, 30, 24, (x, y, t, i) => {
          if (i === 0 || i === 24) return;
          const flap = reduceMotion ? 0 : Math.sin(S.t * 4 + i + si) * 2;
          ctx.fillStyle = cols[(i + si) % cols.length];
          ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x + 6, y); ctx.lineTo(x + flap, y + 13); ctx.closePath(); ctx.fill();
        });
      });
      ctx.globalAlpha = 1;
    }
  }

  // ---------------------------------------------------------------- particles
  function emit(x, y, z, o) {
    if (particles.length > 700) return;
    particles.push(Object.assign({ x, y, z, vx: 0, vy: 0, vz: 0, g: 0, life: 1, max: 1, size: 3, color: '#fff', drag: 0.98 }, o));
  }
  function burst(x, y, z, hue, n, power = 1) {
    if (reduceMotion) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, sp = (60 + Math.random() * 220) * power;
      const life = 0.8 + Math.random() * 0.9;
      emit(x, y, z, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.5, vz: 80 + Math.random() * 260 * power, g: 320, life, max: life, size: 2 + Math.random() * 3, color: Math.random() < 0.3 ? '#ffffff' : hue });
    }
  }
  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.vx *= p.drag; p.vy *= p.drag;
      p.vz -= p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.z < 0) { p.z = 0; p.vz *= -0.35; }
    }
  }
  function drawParticles() {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const p of particles) {
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      const s = p.size * (p.grow ? 1 + (1 - a) * p.grow : 1);
      if (p.ring) {
        ctx.strokeStyle = p.color; ctx.lineWidth = 3 * a;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, p.ring * (1 - a) + 10, (p.ring * (1 - a) + 10) * 0.4, 0, 0, TAU); ctx.stroke();
        continue;
      }
      ctx.beginPath(); ctx.arc(p.x, p.y - p.z, s, 0, TAU); ctx.fill();
      if (p.glow) { ctx.globalAlpha = a * 0.3; ctx.beginPath(); ctx.arc(p.x, p.y - p.z, s * 3, 0, TAU); ctx.fill(); }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // ambient motes (fireflies / dust)
  for (let i = 0; i < (reduceMotion ? 25 : 70); i++) {
    motes.push({ x: Math.random() * W, y: Math.random() * H, z: 10 + Math.random() * 90, ph: Math.random() * TAU, sp: 0.3 + Math.random() * 0.7, gold: Math.random() < 0.35 });
  }
  function drawMotes() {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const t = S.t;
    for (const m of motes) {
      const x = m.x + Math.sin(t * m.sp + m.ph) * 30, y = m.y + Math.cos(t * m.sp * 0.7 + m.ph) * 20;
      const a = 0.35 + 0.35 * Math.sin(t * 2 * m.sp + m.ph);
      ctx.fillStyle = m.gold ? `rgba(255,214,140,${a})` : `rgba(210,180,255,${a})`;
      ctx.beginPath(); ctx.arc(x, y - m.z, 1.8, 0, TAU); ctx.fill();
      ctx.fillStyle = m.gold ? `rgba(255,190,90,${a * 0.25})` : `rgba(168,85,247,${a * 0.25})`;
      ctx.beginPath(); ctx.arc(x, y - m.z, 6, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- NPC students
  const BODY_COLS = ['#f472b6', '#60a5fa', '#fbbf24', '#34d399', '#f87171', '#a78bfa', '#fb923c', '#e5e7eb', '#22d3ee', '#c084fc'];
  const HEAD_COLS = ['#f3d2b3', '#e0b089', '#b57f55', '#8a5a3a', '#6b4430', '#f0c39c'];
  const HAIR_COLS = ['#1f1330', '#3b2416', '#6b3f1f', '#0f0a1a', '#a0522d', '#2d1b4e'];
  const BUBBLES = ['!', '♪', 'idea!', 'yes!', 'ha!', 'same!', 'let’s go', '★', 'nice', 'ooh'];

  function makeNpc(x, y, o = {}) {
    const r = Math.random;
    return Object.assign({
      x, y, hx: x, hy: y, z: 0, tx: x, ty: y, body: pick(BODY_COLS), head: pick(HEAD_COLS), hair: pick(HAIR_COLS),
      legs: pick(['#1e1b4b', '#312e81', '#1f2937', '#3f3f46']), s: 0.92 + r() * 0.16,
      appear: 0, appearAt: 0, walk: 0, wait: r() * 3, hop: 0, bubble: null, bubbleT: 0, sortY: null,
    }, o);
  }
  function spawnNpcs() {
    npcs.length = 0;
    const tryPlace = (cx, cy, rad, minR) => {
      for (let i = 0; i < 30; i++) {
        const a = Math.random() * TAU, d = minR + Math.random() * (rad - minR);
        const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.8;
        if (!collides(x, y, 12) && Math.hypot(x - player.x, y - player.y) > 40) return [x, y];
      }
      return null;
    };
    const groups = [
      { cx: CX, cy: CY, r: 255, min: 110, n: 14 },
      { cx: 390, cy: 1100, r: 210, min: 0, n: 9 },
      { cx: 2240, cy: 950, r: 200, min: 40, n: 8 },
      { cx: CX, cy: 600, r: 200, min: 0, n: 7 },
      { cx: CX, cy: 1690, r: 300, min: 0, n: 4 },
    ];
    let order = 0;
    groups.forEach((g) => {
      for (let i = 0; i < g.n; i++) {
        const pos = tryPlace(g.cx, g.cy, g.r, g.min);
        if (!pos) continue;
        const d = Math.hypot(pos[0] - CX, pos[1] - CY);
        npcs.push(makeNpc(pos[0], pos[1], { appearAt: 1.0 + d / 900 + Math.random() * 0.8 + (order++ % 3) * 0.05 }));
      }
    });
    // spectators in the bleachers
    for (let i = 0; i < 9; i++) {
      const k = i % 4;
      const x = BLEACH.x + 30 + Math.random() * (BLEACH.w - 60);
      const tierY = BLEACH.y + k * 24;
      npcs.push(makeNpc(x, tierY + 12, { z: 84 - k * 19, seated: true, sortY: tierY + 24.5, appearAt: 2.2 + Math.random() }));
    }
    // walkers along the main paths
    const routes = [[[CX - 24, 1900], [CX - 24, 1100]], [[700, CY + 20], [1020, CY + 20]], [[1580, CY - 20], [1940, CY - 20]], [[500, 1690], [1180, 1690]], [[1420, 1690], [2100, 1690]]];
    routes.forEach((rt, i) => {
      const t0 = Math.random();
      const x = lerp(rt[0][0], rt[1][0], t0), y = lerp(rt[0][1], rt[1][1], t0);
      npcs.push(makeNpc(x, y, { route: rt, rt: t0, rdir: i % 2 ? 1 : -1, appearAt: 1.5 + Math.random() }));
    });
  }
  function updateNpcs(dt) {
    const ft = S.finaleT;
    for (const n of npcs) {
      if (n.appear < 1) {
        if (ft >= n.appearAt || S.finished) {
          if (n.appear === 0) { burst(n.x, n.y, 20, pick(['#a855f7', '#fbbf24', '#f0abfc']), 8, 0.35); if (Math.random() < 0.3) Sound.pop(); }
          n.appear = Math.min(1, n.appear + dt * 3);
        }
        continue;
      }
      if (n.route) {
        n.rt += n.rdir * dt * 0.06;
        if (n.rt > 1 || n.rt < 0) { n.rdir *= -1; n.rt = clamp(n.rt, 0, 1); }
        const [a, b] = n.route;
        n.x = lerp(a[0], b[0], n.rt); n.y = lerp(a[1], b[1], n.rt);
        n.walk += dt * 10; n.face = Math.sign((b[0] - a[0]) * n.rdir) || 1;
      } else if (!n.seated) {
        const dx = n.tx - n.x, dy = n.ty - n.y, d = Math.hypot(dx, dy);
        if (d > 2) {
          const sp = 38 * dt;
          const nx = n.x + (dx / d) * sp, ny = n.y + (dy / d) * sp;
          if (!collides(nx, ny, 10)) { n.x = nx; n.y = ny; n.walk += dt * 10; } else { n.tx = n.x; n.ty = n.y; }
        } else {
          n.walk = 0;
          n.wait -= dt;
          if (n.wait <= 0) {
            n.wait = 2 + Math.random() * 4;
            n.tx = n.hx + (Math.random() - 0.5) * 70; n.ty = n.hy + (Math.random() - 0.5) * 40;
          }
        }
      }
      // hops + bubbles
      if (n.hop > 0) { n.hop -= dt; }
      else if (Math.random() < dt * 0.12) n.hop = 0.5;
      if (n.bubbleT > 0) n.bubbleT -= dt;
      else if (Math.random() < dt * 0.05) { n.bubble = pick(BUBBLES); n.bubbleT = 2.2; }
    }
  }
  function drawNpc(p) {
    const n = p.npc;
    if (n.appear <= 0) return;
    const hopZ = n.hop > 0 ? Math.sin((n.hop / 0.5) * Math.PI) * 12 : 0;
    ctx.globalAlpha = n.appear;
    const s = n.s * (0.6 + 0.4 * n.appear);
    drawFigure(n.x, n.y, n.z + hopZ, { s, body: n.body, head: n.head, hair: n.hair, legs: n.legs, walk: n.walk, cheer: n.hop > 0 });
    ctx.globalAlpha = 1;
    if (n.bubbleT > 0 && n.bubble) {
      const a = clamp(n.bubbleT / 0.4, 0, 1) * clamp((2.2 - n.bubbleT) / 0.2, 0, 1);
      const bx = n.x, by = n.y - n.z - 62 * s - hopZ;
      ctx.globalAlpha = a;
      ctx.font = `800 10px ${FONT_D}`;
      const tw = ctx.measureText(n.bubble).width + 14;
      ctx.fillStyle = '#fff'; rr(ctx, bx - tw / 2, by - 11, tw, 20, 9); ctx.fill();
      ctx.beginPath(); ctx.moveTo(bx - 4, by + 8); ctx.lineTo(bx, by + 14); ctx.lineTo(bx + 4, by + 8); ctx.fill();
      ctx.fillStyle = '#4c1d95'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(n.bubble, bx, by);
      ctx.globalAlpha = 1;
    }
  }

  // ---------------------------------------------------------------- lighting
  function lampLevel(l, dt) {
    let target = 0;
    if (S.finaleT >= 0 || S.finished) {
      if (S.finished || S.finaleT >= l.onAt) target = 1;
      else if (l.pre) target = 0.55;
    } else if (l.pre) {
      target = 0.55 * (Math.sin(S.t * 17 + l.ph * 3) + Math.sin(S.t * 5 + l.ph) > 1.6 ? 0.3 : 1);
    }
    const k = target > l.level ? 8 : 3;
    const prev = l.level;
    l.level += (target - l.level) * Math.min(1, dt * k);
    if (prev < 0.8 && l.level >= 0.8 && S.finaleT >= 0 && !S.finished) {
      burst(l.x, l.y, 80, '#ffd48a', 6, 0.25);
    }
  }

  const LIGHTS = [];
  function gatherLights() {
    LIGHTS.length = 0;
    const L = (x, y, r, a) => LIGHTS.push(x, y, r, a);
    const lit = S.lit;
    L(player.x, player.y - 20, 210, 0.95);
    FRAGS.forEach((f) => { if (!f.collected) L(f.x, f.y - 30, 170, 0.9); });
    LAMPS.forEach((l) => { if (l.level > 0.02) L(l.x, l.y - 30, 170, 0.92 * l.level); });
    // auditorium marquee always glows a little — it's a hint
    L(CX, 550, 200 + lit * 120, 0.45 + lit * 0.5);
    L(B.stage.x + 59, B.stage.y + B.stage.d, 110, 0.5);
    L(CX, 1935, 160, 0.6); // gate lanterns
    L(2245, 300, 150, 0.45 + lit * 0.4); // scoreboard
    L(B.commons.x + B.commons.w / 2, B.commons.y + B.commons.d - 60, 170, S.lit > 0.5 ? 0.8 : 0.35 * flicker(3.1));
    if (lit > 0) {
      L(390, 1100, 330, 0.85 * lit);
      L(CX, CY, 320, 0.8 * lit);
      L(2240, 950, 420, 0.75 * lit);
      L(CX, 620, 300, 0.8 * lit);
      [B.classW, B.classE, B.aud, B.commons].forEach((b) => {
        for (let x = b.x + 60; x < b.x + b.w; x += 150) L(x, b.y + b.d + 10, 150, 0.6 * lit);
      });
    }
  }

  function renderLighting() {
    const dark = 0.74 - 0.5 * S.lit;
    const lw = lightC.width, lh = lightC.height;
    lctx.globalCompositeOperation = 'source-over';
    lctx.clearRect(0, 0, lw, lh);
    lctx.fillStyle = `rgba(9,5,30,${dark})`;
    lctx.fillRect(0, 0, lw, lh);
    lctx.globalCompositeOperation = 'destination-out';
    const k = cam.zoom * LS;
    for (let i = 0; i < LIGHTS.length; i += 4) {
      const sx = ((LIGHTS[i] - cam.x) * cam.zoom + VW / 2) * LS;
      const sy = ((LIGHTS[i + 1] - cam.y) * cam.zoom + VH / 2) * LS;
      const r = LIGHTS[i + 2] * k, a = LIGHTS[i + 3];
      if (sx < -r || sy < -r || sx > lw + r || sy > lh + r) continue;
      const g = lctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(0.5, `rgba(0,0,0,${a * 0.55})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      lctx.fillStyle = g; lctx.beginPath(); lctx.arc(sx, sy, r, 0, TAU); lctx.fill();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(lightC, 0, 0, canvas.width, canvas.height);

    // warm additive glows on top
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    const z = cam.zoom;
    LAMPS.forEach((l) => {
      if (l.level < 0.05) return;
      const sx = (l.x - cam.x) * z + VW / 2, sy = (l.y - 76 - cam.y) * z + VH / 2;
      if (sx < -80 || sy < -80 || sx > VW + 80 || sy > VH + 80) return;
      const r = 46 * z;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      g.addColorStop(0, `rgba(255,220,150,${0.75 * l.level})`); g.addColorStop(0.3, `rgba(255,170,80,${0.25 * l.level})`); g.addColorStop(1, 'rgba(255,150,60,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill();
      // pool of warm light on the ground
      const gy = (l.y - cam.y) * z + VH / 2;
      const r2 = 90 * z;
      const g2 = ctx.createRadialGradient(sx, gy, 0, sx, gy, r2);
      g2.addColorStop(0, `rgba(255,170,80,${0.13 * l.level})`); g2.addColorStop(1, 'rgba(255,150,60,0)');
      ctx.fillStyle = g2; ctx.beginPath(); ctx.ellipse(sx, gy, r2, r2 * 0.45, 0, 0, TAU); ctx.fill();
    });
    if (S.lit > 0) {
      // violet sky-glow bloom over the campus
      const g = ctx.createRadialGradient(VW / 2, VH / 2, 0, VW / 2, VH / 2, Math.max(VW, VH) * 0.7);
      g.addColorStop(0, `rgba(120,60,200,${0.1 * S.lit})`); g.addColorStop(1, 'rgba(120,60,200,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---------------------------------------------------------------- main render
  const dyn = [];
  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#0b0822'; ctx.fillRect(0, 0, VW, VH);
    const z = cam.zoom;
    ctx.setTransform(DPR * z, 0, 0, DPR * z, DPR * (VW / 2 - cam.x * z), DPR * (VH / 2 - cam.y * z));

    const hw = VW / 2 / z, hh = VH / 2 / z;
    const vx0 = cam.x - hw, vx1 = cam.x + hw, vy0 = cam.y - hh, vy1 = cam.y + hh;
    if (ground) {
      const sx = clamp(Math.floor(vx0), 0, W), sy = clamp(Math.floor(vy0), 0, H);
      const ex = clamp(Math.ceil(vx1), 0, W), ey = clamp(Math.ceil(vy1), 0, H);
      if (ex > sx && ey > sy) ctx.drawImage(ground, sx, sy, ex - sx, ey - sy, sx, sy, ex - sx, ey - sy);
    }

    // tap target marker
    if (target && S.mode === 'play') {
      const ph = (S.t * 2) % 1;
      ctx.strokeStyle = `rgba(216,180,254,${0.9 - ph * 0.7})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(target.x, target.y, 8 + ph * 16, (8 + ph * 16) * 0.45, 0, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#d8b4fe'; ctx.beginPath(); ctx.ellipse(target.x, target.y, 3, 1.5, 0, 0, TAU); ctx.fill();
    }

    // depth-sorted drawables
    dyn.length = 0;
    const m = 260;
    for (const p of PROPS) {
      if (p.x < vx0 - 800 || p.x > vx1 + 800) { if (p.draw !== drawFence) continue; }
      if (p.y < vy0 - 60 || p.y > vy1 + 500 + m) continue;
      dyn.push(p);
    }
    const pp = { y: player.y, draw: drawPlayer };
    dyn.push(pp);
    for (const n of npcs) {
      if (n.x < vx0 - 60 || n.x > vx1 + 60 || n.y < vy0 - 40 || n.y > vy1 + 120) continue;
      dyn.push({ y: n.sortY || n.y, draw: drawNpc, npc: n });
    }
    dyn.sort((a, b) => a.y - b.y);
    for (const p of dyn) {
      if (p === pp) {
        if (player.spark && player.spark.behind) drawSpark();
        drawPlayer();
        if (player.spark && !player.spark.behind) drawSpark();
      } else p.draw(p);
    }
    drawOverhead();
    drawParticles();
    drawMotes();

    gatherLights();
    renderLighting();
  }

  // ---------------------------------------------------------------- minimap
  const mini = $('#minimap');
  const mctx = mini.getContext('2d');
  let mW = 150, mH = 116;
  function sizeMinimap() {
    const r = mini.getBoundingClientRect();
    mW = r.width || 150; mH = r.height || 116;
    mini.width = Math.round(mW * DPR); mini.height = Math.round(mH * DPR);
  }
  function drawMinimap() {
    if (!mW) return;
    const c = mctx;
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    c.clearRect(0, 0, mW, mH);
    const pad = 8, sc = Math.min((mW - pad * 2) / W, (mH - pad * 2) / H);
    const ox = (mW - W * sc) / 2, oy = (mH - H * sc) / 2;
    c.save(); c.translate(ox, oy); c.scale(sc, sc);
    c.fillStyle = 'rgba(36,86,84,.55)'; rr(c, 0, 0, W, H, 60); c.fill();
    c.lineCap = 'round'; c.strokeStyle = 'rgba(190,175,240,.55)';
    PATHS.forEach((p) => { c.lineWidth = p.w; c.beginPath(); p.pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke(); });
    c.fillStyle = 'rgba(190,175,240,.55)'; c.beginPath(); c.arc(CX, CY, PLAZA.r, 0, TAU); c.fill();
    c.fillStyle = 'rgba(122,53,97,.8)'; rr(c, TRACK.x, TRACK.y, TRACK.w, TRACK.h, TRACK.w / 2); c.fill();
    c.fillStyle = 'rgba(35,105,77,.9)'; rr(c, TRACK.x + 70, TRACK.y + 70, TRACK.w - 140, TRACK.h - 140, 200); c.fill();
    c.fillStyle = 'rgba(91,63,99,.9)'; c.fillRect(PATIO.x, PATIO.y, PATIO.w, PATIO.h);
    c.fillStyle = S.lit > 0.5 ? '#8b6cf0' : '#5b47b8';
    Object.values(B).forEach((b) => c.fillRect(b.x, b.y, b.w, b.d));
    c.fillRect(BLEACH.x, BLEACH.y, BLEACH.w, 96);
    FRAGS.forEach((f) => {
      if (f.collected) {
        c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.arc(f.x, f.y, 34, 0, TAU); c.fill();
        return;
      }
      const pulse = 1 + Math.sin(S.t * 4 + f.id) * 0.25;
      c.fillStyle = hexA(f.hue, 0.35); c.beginPath(); c.arc(f.x, f.y, 110 * pulse, 0, TAU); c.fill();
      c.fillStyle = f.hue; c.save(); c.translate(f.x, f.y); c.rotate(Math.PI / 4); c.fillRect(-40, -40, 80, 80); c.restore();
    });
    // viewport
    const z = cam.zoom, hw = VW / 2 / z, hh = VH / 2 / z;
    c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 14; c.strokeRect(cam.x - hw, cam.y - hh, hw * 2, hh * 2);
    // player
    c.fillStyle = '#fff'; c.beginPath(); c.arc(player.x, player.y, 52, 0, TAU); c.fill();
    c.fillStyle = '#a855f7'; c.beginPath(); c.arc(player.x, player.y, 32, 0, TAU); c.fill();
    c.restore();
  }

  // ---------------------------------------------------------------- DOM refs
  const titleEl = $('#title'), hud = $('#hud'), toast = $('#toast'), modal = $('#modal');
  const finale = $('#finale'), countEl = $('#count'), slots = Array.from(document.querySelectorAll('.slot'));
  const banner = $('#areaBanner'), muteBtn = $('#muteBtn'), msgBtn = $('#msgBtn');
  const collectBtn = $('#collectBtn');

  // controls legend
  $('#controls').innerHTML = isTouch
    ? '<li><kbd>Tap</kbd> anywhere to walk there</li><li><kbd>Hold</kbd> and drag to keep moving</li>'
    : '<li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or <kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> to move</li><li><kbd>Click</kbd> to walk to a spot</li><li><kbd>M</kbd> mute</li>';

  if (isTouch) { const h = modal.querySelector('.hint'); if (h) h.hidden = true; }

  function showToast() { toast.classList.add('show'); S.traveled = 0; }
  function hideToast() { toast.classList.remove('show'); }
  $('#toastBtn').addEventListener('click', () => { Sound.click(); hideToast(); canvas.focus && canvas.focus(); });
  $('#helpBtn').addEventListener('click', () => { Sound.click(); toast.classList.contains('show') ? hideToast() : showToast(); });

  function syncMute() { muteBtn.setAttribute('aria-pressed', Sound.muted ? 'true' : 'false'); muteBtn.setAttribute('aria-label', Sound.muted ? 'Unmute sound' : 'Mute sound'); }
  function toggleMute() { Sound.init(); Sound.setMuted(!Sound.muted); syncMute(); }
  muteBtn.addEventListener('click', toggleMute);
  syncMute();

  $('#restartBtn').addEventListener('click', () => { Sound.click(); restart(); });
  $('#againBtn').addEventListener('click', () => { Sound.click(); restart(); });
  $('#exploreBtn').addEventListener('click', () => { Sound.click(); exploreLit(); });
  msgBtn.addEventListener('click', () => { Sound.click(); showReveal(true); });

  function showBanner(z) {
    banner.querySelector('.ab-name').textContent = z.name;
    banner.querySelector('.ab-tag').textContent = z.tag;
    banner.classList.remove('show');
    void banner.offsetWidth;
    banner.classList.add('show');
  }

  // ---------------------------------------------------------------- title → play
  $('#enterBtn').addEventListener('click', () => {
    Sound.init(); Sound.whoosh();
    titleEl.classList.add('leaving');
    S.mode = 'intro'; S.introT = 0;
    S.zoomMul = 1;
    setTimeout(() => {
      titleEl.hidden = true;
      hud.hidden = false;
      sizeMinimap();
      S.mode = 'play';
      showToast();
      S.zoneAt = -99;
    }, reduceMotion ? 50 : 1150);
  });

  // ---------------------------------------------------------------- input
  const keys = new Set();
  const MOVE_KEYS = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'];
  const canControl = () => S.mode === 'play' && !S.paused;
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (e.target && e.target.tagName === 'BUTTON' && (k === 'enter' || k === ' ')) return;
    if (k === 'm' && S.mode !== 'title') { toggleMute(); return; }
    if (MOVE_KEYS.includes(k)) {
      if (canControl()) e.preventDefault();
      keys.add(k); target = null;
    }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => { keys.clear(); pointerHeld = false; });

  function screenToWorld(cx, cy) { return { x: (cx - VW / 2) / cam.zoom + cam.x, y: (cy - VH / 2) / cam.zoom + cam.y }; }
  function setTarget(e) {
    const p = screenToWorld(e.clientX, e.clientY);
    // tapping a fragment's floating gem walks to its base
    for (const f of FRAGS) {
      if (!f.collected && Math.hypot(p.x - f.x, p.y - (f.y - 40)) < 44) { p.x = f.x; p.y = f.y; }
    }
    target = { x: clamp(p.x, 60, W - 60), y: clamp(p.y, 80, 1940) };
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (!canControl()) return;
    Sound.init();
    pointerHeld = true;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    setTarget(e);
  });
  canvas.addEventListener('pointermove', (e) => { if (pointerHeld && canControl()) setTarget(e); });
  const release = () => { pointerHeld = false; };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---------------------------------------------------------------- movement
  function tryMove(ix, iy, dist) {
    const base = Math.atan2(iy, ix);
    const offs = [0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35, 1.7, -1.7];
    for (const o0 of offs) {
      const o = o0 * steerSign, a = base + o;
      const nx = player.x + Math.cos(a) * dist, ny = player.y + Math.sin(a) * dist;
      if (!collides(nx, ny, PR)) {
        player.x = nx; player.y = ny;
        if (o !== 0) steerSign = Math.sign(o);
        return { ok: true, ax: Math.cos(a), ay: Math.sin(a) };
      }
    }
    return { ok: false };
  }

  function updatePlayer(dt) {
    let ix = 0, iy = 0;
    if (canControl()) {
      if (keys.has('arrowleft') || keys.has('a')) ix -= 1;
      if (keys.has('arrowright') || keys.has('d')) ix += 1;
      if (keys.has('arrowup') || keys.has('w')) iy -= 1;
      if (keys.has('arrowdown') || keys.has('s')) iy += 1;
      if (ix || iy) target = null;
      else if (target) {
        const dx = target.x - player.x, dy = target.y - player.y, d = Math.hypot(dx, dy);
        if (d < 6) { if (!pointerHeld) target = null; }
        else { ix = dx / d; iy = dy / d; }
      }
    }
    const len = Math.hypot(ix, iy);
    player.moving = false;
    if (len > 0) {
      ix /= len; iy /= len;
      let dist = player.speed * dt;
      if (target) dist = Math.min(dist, Math.hypot(target.x - player.x, target.y - player.y));
      const r = tryMove(ix, iy, dist);
      if (r.ok) {
        player.moving = true;
        player.step += dt * 7;
        S.traveled += dist;
        player.stuck = 0;
        if (Math.abs(r.ax) > 0.25) player.face = r.ax > 0 ? 1 : -1;
        player.back = r.ay < -0.55;
        if (Math.random() < dt * 30) emit(player.x + (Math.random() - 0.5) * 10, player.y, 8 + Math.random() * 16, { vz: 20, g: -10, life: 0.6, max: 0.6, size: 1.6, color: Math.random() < 0.5 ? '#c084fc' : '#fbbf24' });
      } else {
        player.stuck += dt;
        if (player.stuck > 0.4) target = null;
      }
    }
    if (S.traveled > 700 && toast.classList.contains('show')) hideToast();

    // discovery
    if (canControl()) {
      for (const f of FRAGS) {
        if (!f.collected && Math.hypot(player.x - f.x, player.y - f.y) < 62) { openDiscovery(f); break; }
      }
      // zone banners
      const z = ZONES.find((zz) => zz.test(player.x, player.y));
      if (z && z.id !== S.zone) {
        S.zone = z.id;
        if (S.t - S.zoneAt > 1.2) showBanner(z);
        S.zoneAt = S.t;
      }
    }
  }

  // ---------------------------------------------------------------- discovery + collection
  function openDiscovery(f) {
    S.paused = true; S.active = f;
    target = null; pointerHeld = false; keys.clear();
    hideToast();
    S.zoomMul = 1.18;
    const card = modal.querySelector('.card');
    card.style.setProperty('--c', f.hue);
    $('#mKicker').textContent = `Idea ${S.collected + 1} of 4 · ${f.zone}`;
    $('#mTitle').textContent = f.title;
    $('#mBody').textContent = f.body;
    $('#mAside').textContent = f.aside;
    $('#mGem').style.color = f.hue;
    collectBtn.disabled = false;
    collectBtn.textContent = S.collected === 3 ? 'Collect the final idea ✦' : 'Collect this idea ✦';
    modal.classList.remove('closing');
    modal.hidden = false;
    banner.classList.remove('show');
    burst(f.x, f.y, 44, f.hue, 40, 0.8);
    emit(f.x, f.y, 0, { ring: 140, life: 0.9, max: 0.9, color: f.hue });
    Sound.discover();
    setTimeout(() => collectBtn.focus({ preventScroll: true }), 60);
  }

  collectBtn.addEventListener('click', () => {
    const f = S.active;
    if (!f || f.collected) return;
    collectBtn.disabled = true;
    f.collected = true;
    const idx = S.collected;
    S.collected++;
    const gemEl = $('#mGem svg');
    const from = gemEl.getBoundingClientRect();
    const slot = slots[idx];
    const to = slot.getBoundingClientRect();

    // world celebration
    burst(f.x, f.y, 44, f.hue, 70, 1.2);
    burst(f.x, f.y, 44, '#ffffff', 20, 0.8);
    emit(f.x, f.y, 0, { ring: 220, life: 1.1, max: 1.1, color: f.hue });
    for (let i = 0; i < 18; i++) {
      emit(f.x + (Math.random() - 0.5) * 30, f.y, 20, { vz: 120 + Math.random() * 160, g: -20, life: 1.6, max: 1.6, size: 2.5, color: f.hue, glow: true, drag: 0.96, vx: (Math.random() - 0.5) * 40 });
    }

    const fly = document.createElement('div');
    fly.className = 'fly-gem';
    fly.style.setProperty('--c', f.hue);
    fly.style.color = f.hue;
    fly.style.left = from.left + 'px'; fly.style.top = from.top + 'px';
    fly.style.width = from.width + 'px'; fly.style.height = from.height + 'px';
    fly.innerHTML = '<svg aria-hidden="true"><use href="#gem"/></svg>';
    document.body.appendChild(fly);

    modal.classList.add('closing');
    setTimeout(() => { modal.hidden = true; modal.classList.remove('closing'); }, 440);

    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const sc = (to.width * 0.7) / from.width;
    const done = () => {
      fly.remove();
      slot.style.setProperty('--c', f.hue);
      slot.style.color = f.hue;
      slot.classList.add('filled');
      countEl.textContent = `${S.collected} / 4`;
      countEl.classList.remove('bump'); void countEl.offsetWidth; countEl.classList.add('bump');
      Sound.collect();
      S.paused = false; S.active = null; S.zoomMul = 1;
      if (S.collected === 4) setTimeout(startFinale, 650);
    };
    if (fly.animate && !reduceMotion) {
      const anim = fly.animate([
        { transform: 'translate(0,0) scale(1) rotate(0deg)', offset: 0 },
        { transform: `translate(${dx * 0.35}px, ${dy * 0.35 - 80}px) scale(1.3) rotate(180deg)`, offset: 0.45 },
        { transform: `translate(${dx}px, ${dy}px) scale(${sc}) rotate(360deg)`, offset: 1 },
      ], { duration: 950, easing: 'cubic-bezier(.55,0,.25,1)', fill: 'forwards' });
      anim.onfinish = done;
    } else {
      setTimeout(done, 200);
    }
  });

  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') { e.preventDefault(); collectBtn.focus(); }
    if (e.key === 'Escape') { e.preventDefault(); collectBtn.click(); }
  });

  // ---------------------------------------------------------------- finale
  function startFinale() {
    S.mode = 'finale'; S.finaleT = 0;
    target = null; keys.clear(); pointerHeld = false;
    hideToast();
    hud.classList.add('cinematic');
    document.body.classList.add('cinema');
    S.zoomMul = 0.7;
    LAMPS.forEach((l) => { l.onAt = 0.6 + (Math.hypot(l.x - CX, l.y - CY) / 1500) * 2.6; });
    spawnNpcs();
    Sound.finale(); Sound.brighten(true);
    emit(CX, CY, 0, { ring: 1400, life: 2.6, max: 2.6, color: '#fbbf24' });
    emit(CX, CY, 0, { ring: 900, life: 2.0, max: 2.0, color: '#a855f7' });
  }
  function updateFinale(dt) {
    S.finaleT += dt;
    const ft = S.finaleT;
    S.lit = easeInOut(clamp((ft - 0.4) / 3.4, 0, 1));
    // rising lanterns from the gathering spots
    if (ft > 1.4 && ft < 7 && Math.random() < dt * (reduceMotion ? 4 : 16)) {
      const spot = pick([[CX, CY], [390, 1100], [2240, 950], [CX, 600]]);
      const x = spot[0] + (Math.random() - 0.5) * 300, y = spot[1] + (Math.random() - 0.5) * 160;
      emit(x, y, 10, { vz: 40 + Math.random() * 50, g: -6, life: 4, max: 4, size: 3 + Math.random() * 2, color: pick(['#ffd48a', '#c084fc', '#fbbf24', '#f0abfc']), glow: true, drag: 0.995, vx: (Math.random() - 0.5) * 12 });
    }
    if (ft > 5.4 && !S.revealShown) showReveal();
  }

  function splitName() {
    const el = finale.querySelector('.fn-first');
    const text = el.dataset.text;
    el.textContent = '';
    el.setAttribute('aria-label', text);
    let i = 0;
    text.split(' ').forEach((word, wi) => {
      if (wi) el.appendChild(document.createTextNode(' '));
      const w = document.createElement('span');
      w.className = 'word';
      w.setAttribute('aria-hidden', 'true');
      for (const ch of word) {
        const s = document.createElement('span');
        s.className = 'ch'; s.textContent = ch;
        s.style.animationDelay = (2.3 + i * 0.07) + 's'; i++;
        w.appendChild(s);
      }
      el.appendChild(w);
    });
  }
  function showReveal(again) {
    S.revealShown = true;
    S.mode = 'end';
    document.body.classList.add('cinema');
    hud.classList.add('cinematic');
    splitName();
    // restart CSS animations
    finale.hidden = true; void finale.offsetWidth; finale.hidden = false;
    setTimeout(() => $('#againBtn').focus({ preventScroll: true }), again ? 400 : 5200);
  }
  function exploreLit() {
    finale.hidden = true;
    document.body.classList.remove('cinema');
    hud.classList.remove('cinematic');
    S.finished = true; S.lit = 1;
    S.mode = 'play'; S.paused = false; S.zoomMul = 1;
    msgBtn.hidden = false;
  }

  function restart() {
    FRAGS.forEach((f) => { f.collected = false; });
    S.collected = 0; S.lit = 0; S.finaleT = -1; S.finished = false; S.revealShown = false;
    S.paused = false; S.active = null; S.zoomMul = 1; S.zone = null;
    npcs.length = 0; particles.length = 0;
    LAMPS.forEach((l) => { l.level = 0; l.onAt = 0; });
    player.x = START.x; player.y = START.y; player.face = 1; player.back = true;
    target = null; keys.clear();
    slots.forEach((s) => { s.classList.remove('filled'); s.style.removeProperty('--c'); s.style.removeProperty('color'); });
    countEl.textContent = '0 / 4';
    modal.hidden = true; finale.hidden = true; msgBtn.hidden = true;
    document.body.classList.remove('cinema');
    hud.classList.remove('cinematic');
    cam.x = player.x; cam.y = player.y - 40;
    Sound.brighten(false);
    S.mode = 'play';
    showToast();
  }

  // ---------------------------------------------------------------- camera
  function updateCamera(dt) {
    let tx, ty, speed = 5;
    if (S.mode === 'title') {
      const t = S.t;
      tx = CX + Math.sin(t * 0.06) * 620; ty = CY - 120 + Math.cos(t * 0.045) * 420;
      speed = 1.2;
    } else if (S.mode === 'finale' || S.mode === 'end') {
      tx = CX; ty = CY - 60 + (S.mode === 'end' ? Math.sin(S.t * 0.1) * 60 : 0);
      if (S.mode === 'end') tx = CX + Math.sin(S.t * 0.08) * 200;
      speed = 1.1;
    } else if (S.active) {
      tx = S.active.x; ty = S.active.y - 50; speed = 3;
    } else {
      tx = player.x; ty = player.y - 40;
      speed = S.mode === 'intro' ? 1.6 : 5;
    }
    const zt = (S.mode === 'title' ? 0.78 : S.zoomMul) * baseZoom;
    cam.zoom += (zt - cam.zoom) * Math.min(1, dt * (S.mode === 'intro' ? 1.6 : 2.4));
    cam.x += (tx - cam.x) * Math.min(1, dt * speed);
    cam.y += (ty - cam.y) * Math.min(1, dt * speed);
    const hw = VW / 2 / cam.zoom, hh = VH / 2 / cam.zoom;
    cam.x = hw * 2 >= W ? W / 2 : clamp(cam.x, hw, W - hw);
    cam.y = hh * 2 >= H + 160 ? H / 2 - 80 : clamp(cam.y, hh - 160, H - hh);
  }

  // ---------------------------------------------------------------- loop
  let last = performance.now();
  let miniTick = 0;
  function frame(now) {
    const dt = clamp((now - last) / 1000, 0, 0.05);
    last = now;
    S.t += dt;
    try {
      if (S.mode === 'intro') { S.introT += dt; }
      updatePlayer(dt);
      if (S.mode === 'finale') updateFinale(dt);
      LAMPS.forEach((l) => lampLevel(l, dt));
      updateNpcs(dt);
      updateParticles(dt);
      updateCamera(dt);
      render();
      if (!hud.hidden && (miniTick++ % 2 === 0)) drawMinimap();
    } catch (err) {
      // never let one bad frame freeze the game
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      if (!frame.warned) { frame.warned = true; console.error(err); }
    }
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- boot
  window.addEventListener('resize', resize);
  resize();
  buildGround();
  cam.x = CX; cam.y = CY; cam.zoom = baseZoom * 0.7;
  player.back = true;
  requestAnimationFrame(frame);

})();
