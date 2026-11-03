// App state. Personal data lives in memory unless the student turns on
// "Remember on this device". Sample-day data is separate and never saved.
import { DEFAULT_SETTINGS, buildSchedule, localDateString, addDays, DAY, weekday } from './scheduler.js';
import { sampleDay } from './sample.js';

const DATA_KEY = 'rt:data:v1';
const PREFS_KEY = 'rt:prefs:v1';

const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(detail) { for (const fn of listeners) fn(detail); }

function safeGet(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}
function safeSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch { return false; }
}
function safeRemove(key) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

export const DEFAULT_PREFS = { theme: 'system', accent: 'lavender', texture: true, motion: 'system', save: false, view: 'auto' };

function emptyPersonal() {
  return {
    plan: { settings: structuredClone(DEFAULT_SETTINGS), commitments: [], tasks: [] },
    morning: [],
    summaries: [],
  };
}

const storedPrefs = safeGet(PREFS_KEY);
export const state = {
  prefs: { ...DEFAULT_PREFS, ...(window.__rtHostTheme ? { theme: window.__rtHostTheme } : {}), ...(storedPrefs || {}) },
  personal: emptyPersonal(),
  demo: null,
  mode: 'personal',
  // Session-only: what the student decided tonight. Never saved, never exported.
  session: { decided: [], canWait: [], stopPlan: null },
  history: { personal: [], demo: [] },
  lastMove: null,
};

if (state.prefs.save) {
  const saved = safeGet(DATA_KEY);
  if (saved && saved.plan) {
    state.personal = { ...emptyPersonal(), ...saved, plan: { ...emptyPersonal().plan, ...saved.plan, settings: { ...DEFAULT_SETTINGS, ...saved.plan.settings } } };
  }
}

export function persist() {
  safeSet(PREFS_KEY, state.prefs);
  if (state.prefs.save) {
    safeSet(DATA_KEY, state.personal);
  } else {
    safeRemove(DATA_KEY);
  }
}

export function setPref(key, value) {
  state.prefs[key] = value;
  persist();
  emit({ type: 'prefs', key });
}

export function isDemo() { return state.mode === 'demo'; }

export function enterDemo() {
  state.demo = sampleDay();
  state.mode = 'demo';
  state.history.demo = [];
  state.lastMove = null;
  emit({ type: 'mode' });
}
export function exitDemo() {
  state.mode = 'personal';
  state.demo = null;
  state.lastMove = null;
  emit({ type: 'mode' });
}

export function active() { return state.mode === 'demo' ? state.demo : state.personal; }
export function getPlan() { return active().plan; }

/** Plan start date and current minute for the active mode. */
export function clock() {
  if (state.mode === 'demo') {
    return { startDate: state.demo.startDate, nowMin: state.demo.nowMin, demo: true };
  }
  const now = new Date();
  return { startDate: localDateString(now), nowMin: now.getHours() * 60 + now.getMinutes(), demo: false };
}

export function schedule(plan = getPlan()) {
  const c = clock();
  return buildSchedule(plan, { startDate: c.startDate, nowMin: c.nowMin, days: 7 });
}

/**
 * Change the plan with undo support.
 * @param {(plan) => void} fn mutates a draft copy
 * @param {string} description shown in the undo toast
 */
export function updatePlan(fn, description = 'Change', meta = {}) {
  const a = active();
  state.lastMove = meta.move || null;
  const before = structuredClone(a.plan);
  const draft = structuredClone(a.plan);
  fn(draft);
  a.plan = draft;
  const stack = state.history[state.mode];
  stack.push({ plan: before, description });
  if (stack.length > 40) stack.shift();
  if (state.mode === 'personal') persist();
  emit({ type: 'plan', description, before });
  return { before, after: draft };
}

export function canUndo() { return state.history[state.mode].length > 0; }
export function undo() {
  const stack = state.history[state.mode];
  const last = stack.pop();
  if (!last) return null;
  const before = active().plan;
  active().plan = last.plan;
  state.lastMove = null;
  if (state.mode === 'personal') persist();
  emit({ type: 'plan', description: `Undid: ${last.description}`, before, undo: true });
  return last.description;
}

export function addMorning(entry) {
  state.personal.morning.push(entry);
  persist();
  emit({ type: 'morning' });
}
export function deleteMorning(idx) {
  state.personal.morning.splice(idx, 1);
  persist();
  emit({ type: 'morning' });
}
export function keepSummary(summary) {
  state.personal.summaries.push(summary);
  persist();
  emit({ type: 'summaries' });
}
export function deleteSummary(idx) {
  state.personal.summaries.splice(idx, 1);
  persist();
  emit({ type: 'summaries' });
}

export function decide(text) {
  if (text && !state.session.decided.includes(text)) state.session.decided.push(text);
}
export function canWait(text) {
  if (text && !state.session.canWait.includes(text)) state.session.canWait.push(text);
}

/** Delete everything saved and in memory. */
export function deleteEverything() {
  safeRemove(DATA_KEY);
  safeRemove(PREFS_KEY);
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith('rt:')) localStorage.removeItem(k);
    }
  } catch { /* ignore */ }
  state.personal = emptyPersonal();
  state.prefs = { ...DEFAULT_PREFS };
  state.session = { decided: [], canWait: [], stopPlan: null };
  state.history = { personal: [], demo: [] };
  state.demo = null;
  state.mode = 'personal';
  state.lastMove = null;
  emit({ type: 'reset' });
  emit({ type: 'prefs' });
}

export function resetPlan() {
  updatePlan((p) => {
    p.settings = structuredClone(DEFAULT_SETTINGS);
    p.commitments = [];
    p.tasks = [];
  }, 'Clear plan');
}

export { DAY, addDays, weekday };
