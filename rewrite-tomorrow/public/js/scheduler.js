// Rewrite Tomorrow — scheduling engine.
// Pure functions only: no DOM, no storage. Shared by the browser app and the Node tests.
//
// Time model: every time is an absolute number of minutes from 00:00 on the plan's
// first day ("day 0") in the device's local time zone. Day i covers [i*1440, (i+1)*1440).
// Overnight items simply run past a day boundary, so sleep that starts at 22:30 and
// ends at 06:30 is one continuous block.
//
// Rules, in order:
//  1. Protected sleep opportunity, wind-down and morning routine are reserved first.
//  2. School, travel and fixed commitments are reserved next.
//  3. Study sessions are placed only in what remains, before each task's deadline.
//  4. Sleep is never shortened and nothing overlaps a reserved block to make work fit.
//     Work that does not fit stays visible as "unscheduled" with a reason.

export const SLOT = 5; // minutes per scheduling slot
export const DAY = 1440;

export const DEFAULT_SETTINGS = {
  ageBand: '16-18',
  wake: '06:30',
  sleepHours: 9,
  windDown: 30,
  morning: 45,
  sessionLen: 45,
  breakLen: 10,
  dailyCap: 180,
  bufferAfter: 15,
  school: { enabled: true, days: [1, 2, 3, 4, 5], start: '07:30', end: '14:30', travelBefore: 30, travelAfter: 30 },
};

export function toMin(hhmm) {
  if (typeof hhmm !== 'string') return NaN;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return NaN;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 23 || mm > 59) return NaN;
  return h * 60 + mm;
}

export function fmtTime(min) {
  const m = ((Math.round(min) % DAY) + DAY) % DAY;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function fmtDuration(min) {
  min = Math.max(0, Math.round(min));
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  return `${m} min`;
}

// Calendar-day arithmetic on 'YYYY-MM-DD' strings, done in UTC so DST never shifts a day.
export function parseDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
export function dayDiff(a, b) {
  const pa = parseDate(a);
  const pb = parseDate(b);
  if (pa == null || pb == null) return NaN;
  return Math.round((pa - pb) / 86400000);
}
export function addDays(s, n) {
  const d = new Date(parseDate(s) + n * 86400000);
  return d.toISOString().slice(0, 10);
}
export function weekday(s) {
  return new Date(parseDate(s)).getUTCDay(); // 0 = Sunday
}
export function localDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Absolute minute for a local date + time relative to the plan start. */
export function absMinute(startDate, dateStr, timeStr) {
  const dd = dayDiff(dateStr, startDate);
  const t = toMin(timeStr);
  if (Number.isNaN(dd) || Number.isNaN(t)) return NaN;
  return dd * DAY + t;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function dayName(startDate, dayIndex, long = false) {
  const wd = weekday(addDays(startDate, dayIndex));
  return (long ? DAY_NAMES_LONG : DAY_NAMES)[wd];
}
/** "Tue 19:30" style label for an absolute minute. */
export function label(startDate, abs, long = false) {
  const d = Math.floor(abs / DAY);
  return `${dayName(startDate, d, long)} ${fmtTime(abs)}`;
}

function overlap(a, b) {
  return Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
}

let uid = 0;
export function makeId(prefix = 'id') {
  uid += 1;
  return `${prefix}-${Date.now().toString(36)}-${uid.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Validate settings; returns a list of readable problems (empty when fine). */
export function validateSettings(s) {
  const errs = [];
  if (Number.isNaN(toMin(s.wake))) errs.push({ field: 'wake', msg: 'Wake-up time needs to look like 06:30.' });
  if (!(s.sleepHours >= 4 && s.sleepHours <= 12)) errs.push({ field: 'sleepHours', msg: 'Choose a sleep opportunity between 4 and 12 hours.' });
  if (s.school && s.school.enabled) {
    const a = toMin(s.school.start);
    const b = toMin(s.school.end);
    if (Number.isNaN(a) || Number.isNaN(b)) errs.push({ field: 'school', msg: 'School times need to look like 07:30.' });
    else if (b <= a) errs.push({ field: 'school', msg: 'School needs to finish after it starts.' });
  }
  return errs;
}

export function validateTask(t) {
  const errs = [];
  if (!t.title || !String(t.title).trim()) errs.push({ field: 'title', msg: 'Give the task a short name.' });
  if (!(Number(t.minutes) >= 5 && Number(t.minutes) <= 1440)) errs.push({ field: 'minutes', msg: 'Estimated time should be between 5 minutes and 24 hours.' });
  if (!parseDate(t.dueDate)) errs.push({ field: 'dueDate', msg: 'Choose a due date.' });
  if (Number.isNaN(toMin(t.dueTime || ''))) errs.push({ field: 'dueTime', msg: 'Choose a due time, like 08:00.' });
  return errs;
}

export function validateCommitment(c) {
  const errs = [];
  if (!c.title || !String(c.title).trim()) errs.push({ field: 'title', msg: 'Give the commitment a name.' });
  if (!c.days || !c.days.length) errs.push({ field: 'days', msg: 'Pick at least one day.' });
  const a = toMin(c.start);
  const b = toMin(c.end);
  if (Number.isNaN(a) || Number.isNaN(b)) errs.push({ field: 'time', msg: 'Times need to look like 17:00.' });
  else if (a === b) errs.push({ field: 'time', msg: 'Start and end can’t be the same time.' });
  return errs;
}

/**
 * Reserved (non-study) blocks: sleep, wind-down, morning routine, school, travel, commitments.
 */
export function reservedBlocks(plan, startDate, days) {
  const s = { ...DEFAULT_SETTINGS, ...plan.settings };
  const school = { ...DEFAULT_SETTINGS.school, ...(s.school || {}) };
  const blocks = [];
  const wake = toMin(s.wake);
  const sleepMin = Math.round(s.sleepHours * 60);

  // Nights: the night ending on day d's wake-up, for d = 0..days.
  for (let d = 0; d <= days; d++) {
    const end = d * DAY + wake;
    const start = end - sleepMin;
    blocks.push({ id: `sleep-${d}`, type: 'sleep', title: 'Protected sleep opportunity', start, end, night: d });
    if (s.windDown > 0) {
      blocks.push({ id: `wind-${d}`, type: 'winddown', title: 'Wind-down', start: start - s.windDown, end: start, night: d });
    }
    if (s.morning > 0 && d < days) {
      blocks.push({ id: `morning-${d}`, type: 'morning', title: 'Getting ready', start: end, end: end + s.morning });
    }
  }

  for (let d = -1; d < days; d++) {
    const date = addDays(startDate, d);
    const wd = weekday(date);
    if (school.enabled && school.days.includes(wd)) {
      const a = d * DAY + toMin(school.start);
      const b = d * DAY + toMin(school.end);
      if (school.travelBefore > 0) blocks.push({ id: `travelb-${d}`, type: 'travel', title: 'Travel to school', start: a - school.travelBefore, end: a, fixed: true });
      blocks.push({ id: `school-${d}`, type: 'school', title: 'School', start: a, end: b, fixed: true });
      if (school.travelAfter > 0) blocks.push({ id: `travela-${d}`, type: 'travel', title: 'Travel home', start: b, end: b + school.travelAfter, fixed: true });
    }
    for (const c of plan.commitments || []) {
      if (!c.days || !c.days.includes(wd)) continue;
      const a = toMin(c.start);
      let b = toMin(c.end);
      if (Number.isNaN(a) || Number.isNaN(b)) continue;
      if (b <= a) b += DAY; // crosses midnight
      blocks.push({ id: `c-${c.id}-${d}`, type: 'commitment', title: c.title, start: d * DAY + a, end: d * DAY + b, fixed: true, commitmentId: c.id });
    }
  }
  return blocks;
}

/** Overlaps between fixed commitments, and between fixed commitments and protected sleep. */
export function findConflicts(blocks, horizonEnd) {
  const fixed = blocks.filter((b) => b.fixed && b.end > 0 && b.start < horizonEnd);
  const sleepish = blocks.filter((b) => (b.type === 'sleep' || b.type === 'winddown') && b.end > 0 && b.start < horizonEnd);
  const conflicts = [];
  for (let i = 0; i < fixed.length; i++) {
    for (let j = i + 1; j < fixed.length; j++) {
      const a = fixed[i];
      const b = fixed[j];
      // travel naturally touches school; only real overlaps count
      const o = overlap(a, b);
      if (o > 0) {
        conflicts.push({
          id: `x-${a.id}-${b.id}`,
          kind: 'overlap',
          a, b,
          start: Math.max(a.start, b.start),
          end: Math.min(a.end, b.end),
          minutes: o,
        });
      }
    }
    for (const s of sleepish) {
      const o = overlap(fixed[i], s);
      if (o > 0) {
        conflicts.push({
          id: `s-${fixed[i].id}-${s.id}`,
          kind: s.type === 'sleep' ? 'sleep' : 'winddown',
          a: fixed[i], b: s,
          start: Math.max(fixed[i].start, s.start),
          end: Math.min(fixed[i].end, s.end),
          minutes: o,
        });
      }
    }
  }
  return conflicts;
}

/**
 * Build the whole schedule.
 * @param {object} plan  { settings, commitments, tasks }
 * @param {object} opts  { startDate: 'YYYY-MM-DD', nowMin: minutes from day-0 midnight, days }
 */
export function buildSchedule(plan, opts) {
  const s = { ...DEFAULT_SETTINGS, ...plan.settings };
  const days = opts.days || 7;
  const startDate = opts.startDate;
  const horizonEnd = days * DAY;
  const nSlots = horizonEnd / SLOT;
  const nowSlot = Math.max(0, Math.ceil((opts.nowMin || 0) / SLOT));

  const reserved = reservedBlocks(plan, startDate, days);
  const conflicts = findConflicts(reserved, horizonEnd);

  // free[] marks 5-minute slots available for study.
  const free = new Uint8Array(nSlots).fill(1);
  const mark = (start, end, v = 0) => {
    const a = Math.max(0, Math.floor(start / SLOT));
    const b = Math.min(nSlots, Math.ceil(end / SLOT));
    for (let i = a; i < b; i++) free[i] = v;
  };
  for (let i = 0; i < nowSlot && i < nSlots; i++) free[i] = 0;
  for (const b of reserved) {
    mark(b.start, b.end);
    if (b.fixed && s.bufferAfter > 0) mark(b.end, b.end + s.bufferAfter); // breathing room after commitments
  }
  const availableMask = Uint8Array.from(free); // snapshot before study placement

  const capSlots = Math.floor((s.dailyCap || 9999) / SLOT);
  const usedPerDay = new Array(days).fill(0);
  const sessionSlots = Math.max(1, Math.round((s.sessionLen || 45) / SLOT));
  const breakSlots = Math.max(0, Math.round((s.breakLen || 0) / SLOT));
  const minChunk = Math.min(sessionSlots, Math.round(20 / SLOT));

  const study = [];
  const unscheduled = [];
  const notes = [];

  const tasks = (plan.tasks || [])
    .filter((t) => !t.done)
    .map((t, idx) => ({ t, idx, due: absMinute(startDate, t.dueDate, t.dueTime) }))
    .sort((x, y) => {
      if (!!y.t.tonight - !!x.t.tonight) return !!y.t.tonight - !!x.t.tonight;
      if (x.due !== y.due) return x.due - y.due;
      const pr = { high: 0, medium: 1, low: 2 };
      if (pr[x.t.priority] !== pr[y.t.priority]) return (pr[x.t.priority] ?? 1) - (pr[y.t.priority] ?? 1);
      if (Number(x.t.minutes) !== Number(y.t.minutes)) return Number(x.t.minutes) - Number(y.t.minutes);
      return x.idx - y.idx;
    });

  const place = (task, a, len, pinned) => {
    for (let i = a; i < a + len; i++) free[i] = 0;
    const day = Math.floor((a * SLOT) / DAY);
    if (day >= 0 && day < days) usedPerDay[day] += len;
    study.push({
      id: `st-${task.id}-${a}`,
      type: 'study',
      title: task.title,
      taskId: task.id,
      start: a * SLOT,
      end: (a + len) * SLOT,
      pinned: !!pinned,
      priority: task.priority,
    });
    // break after the session (only if that time is free anyway)
    for (let i = a + len; i < Math.min(nSlots, a + len + breakSlots); i++) {
      if (free[i]) free[i] = 2; // 2 = break buffer, not for study
    }
  };

  // Pass 1 — pinned sessions the student moved by hand.
  const remaining = new Map();
  for (const { t } of tasks) remaining.set(t.id, Math.max(0, Math.round(Number(t.minutes) / SLOT)));
  for (const { t, due } of tasks) {
    for (const pin of t.pins || []) {
      const a = Math.floor(pin.start / SLOT);
      const len = Math.min(Math.round(pin.minutes / SLOT), remaining.get(t.id));
      if (len <= 0) continue;
      let ok = a >= nowSlot && a + len <= nSlots && pin.start + pin.minutes <= due;
      for (let i = a; ok && i < a + len; i++) if (free[i] !== 1) ok = false;
      if (ok) {
        place(t, a, len, true);
        remaining.set(t.id, remaining.get(t.id) - len);
      } else {
        notes.push({ taskId: t.id, msg: `A session you moved for “${t.title}” no longer fits at ${label(startDate, pin.start)}, so it was placed automatically instead.` });
      }
    }
  }

  // Pass 2a — work the student planned for tonight gets first claim on tonight
  // only (up to tonight's wind-down). Anything left joins the normal queue.
  const firstSleep = reserved.filter((b) => b.type === 'sleep' && b.end > (opts.nowMin || 0)).sort((a, b) => a.start - b.start)[0];
  const tonightWind = firstSleep ? reserved.find((b) => b.type === 'winddown' && b.night === firstSleep.night) : null;
  const tonightEndSlot = Math.min(nSlots, Math.floor((tonightWind ? tonightWind.start : firstSleep ? firstSleep.start : 0) / SLOT));
  const fillWindow = (t, from, to) => {
    let left = remaining.get(t.id);
    let i = from;
    let placed = false;
    while (left > 0 && i < to) {
      if (free[i] !== 1) { i++; continue; }
      const day = Math.floor((i * SLOT) / DAY);
      const capLeft = capSlots - (usedPerDay[day] || 0);
      if (capLeft < Math.min(minChunk, left)) {
        i = Math.ceil(((day + 1) * DAY) / SLOT);
        continue;
      }
      let run = 0;
      while (i + run < to && free[i + run] === 1 && run < sessionSlots) run++;
      const len = Math.min(run, left, capLeft, sessionSlots);
      if (len < minChunk && len < left) { i += Math.max(1, run); continue; }
      place(t, i, len, false);
      placed = true;
      left -= len;
      i += len + breakSlots;
    }
    remaining.set(t.id, left);
    return placed;
  };
  const placedSome = new Set();
  for (const { t, due } of tasks) {
    if (!t.tonight || remaining.get(t.id) <= 0 || Number.isNaN(due) || due <= (opts.nowMin || 0)) continue;
    const to = Math.min(tonightEndSlot, Math.floor(due / SLOT));
    if (fillWindow(t, nowSlot, to)) placedSome.add(t.id);
  }
  // later passes treat every task by deadline
  tasks.sort((x, y) => (x.due !== y.due ? x.due - y.due : 0));

  // Pass 2b — automatic placement, earliest deadline first.
  for (const { t, due } of tasks) {
    let left = remaining.get(t.id);
    if (left <= 0) continue;
    if (Number.isNaN(due)) {
      unscheduled.push({ taskId: t.id, title: t.title, minutes: left * SLOT, reason: 'invalid' });
      continue;
    }
    const dueSlot = Math.min(nSlots, Math.floor(due / SLOT));
    if (due <= (opts.nowMin || 0)) {
      unscheduled.push({ taskId: t.id, title: t.title, minutes: left * SLOT, reason: 'past', due });
      continue;
    }
    const notBefore = t.notBefore != null ? Math.ceil(t.notBefore / SLOT) : 0;
    let i = Math.max(nowSlot, notBefore);
    let placedAny = placedSome.has(t.id);
    while (left > 0 && i < dueSlot) {
      if (free[i] !== 1) { i++; continue; }
      const day = Math.floor((i * SLOT) / DAY);
      const capLeft = capSlots - (usedPerDay[day] || 0);
      if (capLeft < Math.min(minChunk, left)) {
        i = Math.ceil(((day + 1) * DAY) / SLOT); // daily limit reached → next day
        continue;
      }
      let run = 0;
      while (i + run < dueSlot && free[i + run] === 1 && run < sessionSlots) run++;
      const len = Math.min(run, left, capLeft, sessionSlots);
      if (len < minChunk && len < left) { i += Math.max(1, run); continue; }
      place(t, i, len, false);
      placedAny = true;
      left -= len;
      i += len + breakSlots;
    }
    if (left > 0) {
      // Is there any free study time at all before the deadline?
      let anyFreeBefore = false;
      for (let k = Math.max(nowSlot, notBefore); k < dueSlot; k++) if (availableMask[k] === 1) { anyFreeBefore = true; break; }
      unscheduled.push({
        taskId: t.id,
        title: t.title,
        minutes: left * SLOT,
        due,
        reason: !placedAny && !anyFreeBefore ? 'no-slot-before-deadline' : 'not-enough-time',
      });
    }
  }

  study.sort((a, b) => a.start - b.start);

  // Honest numbers.
  let availableStudyMin = 0;
  for (let i = 0; i < nSlots; i++) if (availableMask[i] === 1) availableStudyMin += SLOT;
  const scheduledStudyMin = study.reduce((n, b) => n + (b.end - b.start), 0);
  const remainingMin = unscheduled.reduce((n, u) => n + u.minutes, 0);

  return {
    startDate,
    days,
    nowMin: opts.nowMin || 0,
    reserved,
    study,
    blocks: [...reserved, ...study].sort((a, b) => a.start - b.start),
    unscheduled,
    conflicts,
    notes,
    stats: {
      availableStudyMin,
      scheduledStudyMin,
      remainingMin,
      sleepOpportunityMin: Math.round(s.sleepHours * 60),
    },
    freeMask: free,
    availableMask,
  };
}

/** Free study windows (after placement) of at least `minLen` minutes inside [from, to). */
export function freeWindows(schedule, from, to, minLen = 20) {
  const out = [];
  const mask = schedule.freeMask;
  let a = Math.max(0, Math.ceil(from / SLOT));
  const b = Math.min(mask.length, Math.floor(to / SLOT));
  while (a < b) {
    if (mask[a] !== 1) { a++; continue; }
    let e = a;
    while (e < b && mask[e] === 1) e++;
    if ((e - a) * SLOT >= minLen) out.push({ start: a * SLOT, end: e * SLOT });
    a = e;
  }
  return out;
}

/** Tonight: from now until tonight's wind-down begins. */
export function tonightWindow(plan, schedule) {
  const now = schedule.nowMin;
  const nights = schedule.reserved.filter((b) => b.type === 'winddown' || b.type === 'sleep');
  // the first sleep block that ends after now
  const sleep = schedule.reserved.filter((b) => b.type === 'sleep' && b.end > now).sort((a, b) => a.start - b.start)[0];
  const wind = nights.find((b) => b.type === 'winddown' && sleep && b.night === sleep.night);
  const protectStart = wind ? wind.start : sleep ? sleep.start : now;
  // Usable study time: open gaps of at least 20 minutes (shorter gaps can't hold a session).
  let available = 0;
  const a = Math.ceil(now / SLOT);
  const e = Math.min(Math.floor(protectStart / SLOT), schedule.availableMask.length);
  let run = 0;
  for (let i = a; i <= e; i++) {
    if (i < e && schedule.availableMask[i] === 1) run += SLOT;
    else { if (run >= 20) available += run; run = 0; }
  }
  return { now, protectStart, sleepStart: sleep ? sleep.start : null, sleepEnd: sleep ? sleep.end : null, available, isNight: now >= protectStart };
}

/**
 * Time needed if the student tried to do all `minutes` of work now, back-to-back with
 * breaks, skipping nothing. Used only to describe the current plan honestly.
 */
export function finishTimeIfAllTonight(schedule, minutes, settings) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const sessions = Math.ceil(minutes / s.sessionLen);
  const breaks = Math.max(0, sessions - 1) * s.breakLen;
  // Walk forward through time that is not a fixed commitment (sleep is NOT skipped:
  // that is exactly the competition we want to show).
  let t = Math.ceil(schedule.nowMin / SLOT) * SLOT;
  let need = minutes + breaks;
  const fixed = schedule.reserved.filter((b) => b.fixed);
  let guard = 0;
  while (need > 0 && guard++ < 5000) {
    const f = fixed.find((b) => t >= b.start && t < b.end);
    if (f) { t = f.end; continue; }
    t += SLOT;
    need -= SLOT;
  }
  return t;
}

/**
 * Signature feature: propose a rewrite of this evening.
 * choices: { [taskId]: 'tonight' | 'move' | 'help' }
 * Returns a proposed plan plus a plain explanation of every change.
 */
export function proposeRewrite(plan, opts, selectedIds, choices) {
  const base = buildSchedule(plan, opts);
  const tw = tonightWindow(plan, base);
  const s = { ...DEFAULT_SETTINGS, ...plan.settings };
  const selected = plan.tasks.filter((t) => selectedIds.includes(t.id) && !t.done);
  const demand = selected.reduce((n, t) => n + Number(t.minutes), 0);
  const finish = finishTimeIfAllTonight(base, demand, s);
  const tomorrowStart = (() => {
    const morning = base.reserved.find((b) => b.type === 'morning' && b.start >= tw.protectStart);
    return morning ? morning.end : tw.protectStart + 12 * 60;
  })();

  const pr = { high: 0, medium: 1, low: 2 };
  const order = [...selected].sort((a, b) => {
    const ca = choices[a.id] === 'tonight' ? 0 : choices[a.id] === 'help' ? 1 : 2;
    const cb = choices[b.id] === 'tonight' ? 0 : choices[b.id] === 'help' ? 1 : 2;
    if (ca !== cb) return ca - cb;
    const da = absMinute(opts.startDate, a.dueDate, a.dueTime);
    const db = absMinute(opts.startDate, b.dueDate, b.dueTime);
    if (da !== db) return da - db;
    return (pr[a.priority] ?? 1) - (pr[b.priority] ?? 1);
  });

  // Trial run with the real scheduler: "tonight" tasks go first, everything the
  // student chose to move starts tomorrow. Whatever actually lands before the
  // wind-down is what fits tonight — no estimates.
  const trialTasks = plan.tasks.map((t) => {
    if (!selectedIds.includes(t.id) || t.done) return { ...t, tonight: false };
    const ch = choices[t.id] || 'move';
    return ch === 'tonight' ? { ...t, tonight: true, pins: [] } : { ...t, tonight: false, pins: [], notBefore: tomorrowStart };
  });
  const trial = buildSchedule({ ...plan, tasks: trialTasks }, opts);
  const tonightMinutes = (id) => trial.study
    .filter((b) => b.taskId === id && b.start >= tw.now && b.end <= tw.protectStart)
    .reduce((n, b) => n + (b.end - b.start), 0);

  const newTasks = plan.tasks.map((t) => ({ ...t, pins: [...(t.pins || [])], tonight: false }));
  const byId = new Map(newTasks.map((t) => [t.id, t]));
  const changes = [];
  const helpTasks = [];

  for (const t of order) {
    const choice = choices[t.id] || 'move';
    const nt = byId.get(t.id);
    const mins = Number(t.minutes);
    if (choice === 'tonight') {
      const fit = tonightMinutes(t.id);
      if (fit >= mins) {
        nt.tonight = true;
        nt.pins = [];
        changes.push({ taskId: t.id, kind: 'keep', title: t.title, minutes: mins });
      } else if (fit >= 15) {
        // Do the essential part tonight; the rest moves.
        const rest = mins - fit;
        nt.title = `${t.title} — essential part`;
        nt.minutes = fit;
        nt.tonight = true;
        nt.pins = [];
        const restTask = { ...t, id: `${t.id}-rest`, title: `${t.title} — the rest`, minutes: rest, tonight: false, notBefore: tomorrowStart, pins: [], splitFrom: t.id };
        newTasks.push(restTask);
        byId.set(restTask.id, restTask);
        changes.push({ taskId: t.id, kind: 'split', title: t.title, tonightMinutes: fit, restMinutes: rest, restId: restTask.id });
      } else {
        nt.notBefore = tomorrowStart;
        nt.pins = [];
        changes.push({ taskId: t.id, kind: 'no-room', title: t.title, minutes: mins });
      }
    } else if (choice === 'help') {
      nt.notBefore = tomorrowStart;
      nt.pins = [];
      const ask = {
        id: `${t.id}-ask`,
        title: `Prepare a question for the teacher about “${t.title}”`,
        minutes: 10,
        dueDate: t.dueDate,
        dueTime: t.dueTime,
        priority: 'high',
        flexible: false,
        tonight: false,
        pins: [],
        helpFor: t.id,
      };
      helpTasks.push(ask);
      changes.push({ taskId: t.id, kind: 'help', title: t.title, minutes: mins, askId: ask.id });
    } else {
      nt.notBefore = tomorrowStart;
      nt.pins = [];
      changes.push({ taskId: t.id, kind: 'move', title: t.title, minutes: mins });
    }
  }
  for (const h of helpTasks) {
    if (!byId.has(h.id)) { newTasks.push(h); byId.set(h.id, h); }
  }

  const proposedPlan = { ...plan, tasks: newTasks };
  const proposed = buildSchedule(proposedPlan, opts);

  // Explain exactly what moved and why, using the real new schedule.
  const firstSession = (sched, id) => sched.study.find((b) => b.taskId === id);
  const unsched = (sched, id) => sched.unscheduled.find((u) => u.taskId === id);
  for (const c of changes) {
    const nt = byId.get(c.taskId);
    const due = absMinute(opts.startDate, nt.dueDate, nt.dueTime);
    const dueLabel = label(opts.startDate, due);
    const was = firstSession(base, c.taskId);
    c.wasLabel = was ? label(opts.startDate, was.start) : null;
    if (c.kind === 'keep' || c.kind === 'split') {
      const f = firstSession(proposed, c.taskId);
      c.nowLabel = f ? label(opts.startDate, f.start) : null;
    }
    const targetId = c.kind === 'split' ? c.restId : c.taskId;
    if (c.kind !== 'keep') {
      const f = firstSession(proposed, targetId);
      const u = unsched(proposed, targetId);
      c.newLabel = f ? label(opts.startDate, f.start) : null;
      c.stillUnscheduled = u ? u.minutes : 0;
    }
    c.dueLabel = dueLabel;
    c.reason = explainChange(c, nt, plan.tasks.find((t) => t.id === c.taskId));
    if (c.askId) {
      const f = firstSession(proposed, c.askId);
      c.askLabel = f ? label(opts.startDate, f.start) : null;
    }
  }

  const tonightProposed = proposed.study.filter((b) => b.start >= tw.now && b.end <= tw.protectStart);
  const tonightProposedMin = tonightProposed.reduce((n, b) => n + (b.end - b.start), 0);

  return {
    base,
    proposed,
    proposedPlan,
    tonight: tw,
    demand,
    finishIfAll: finish,
    overBy: Math.max(0, finish - tw.protectStart),
    changes,
    tonightProposedMin,
    tomorrowStart,
  };
}

function explainChange(c, nt, orig) {
  const flexible = orig && orig.flexible !== false;
  switch (c.kind) {
    case 'keep':
      return 'You marked this as needing to happen tonight, and it fits before your wind-down.';
    case 'split':
      return `Only ${fmtDuration(c.tonightMinutes)} of this fits before your wind-down, so the most important part happens tonight. ${c.newLabel ? `The remaining ${fmtDuration(c.restMinutes)} moves to the next open study time${c.stillUnscheduled ? ', though not all of it fits before the deadline' : ''}.` : `There’s no open study time for the remaining ${fmtDuration(c.restMinutes)} before it’s due.`}`;
    case 'no-room':
      return 'There is no study time left before tonight’s wind-down, so this moves to the next open slot.';
    case 'help':
      return 'You chose to ask for help or more time. A 10-minute task to prepare your question is added, and the work itself moves out of tonight.';
    case 'move':
    default:
      return flexible
        ? `You said this could move. It goes to the next open study time before it’s due (${c.dueLabel}).`
        : `You chose to move this. It goes to the next open study time before it’s due (${c.dueLabel}).`;
  }
}

/** Compare two schedules and report tasks whose first session changed. */
export function diffSchedules(before, after) {
  const firstStart = (sched) => {
    const m = new Map();
    for (const b of sched.study) if (!m.has(b.taskId)) m.set(b.taskId, b.start);
    return m;
  };
  const a = firstStart(before);
  const b = firstStart(after);
  const moved = [];
  for (const [id, start] of b) {
    if (a.has(id) && a.get(id) !== start) moved.push({ taskId: id, from: a.get(id), to: start });
  }
  return moved;
}
