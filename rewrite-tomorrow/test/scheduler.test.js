import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSchedule, proposeRewrite, tonightWindow, findConflicts, reservedBlocks,
  toMin, fmtTime, absMinute, diffSchedules, validateTask, freeWindows, DAY,
} from '../public/js/scheduler.js';

const START = '2026-11-02'; // a Monday
const baseSettings = {
  wake: '06:30', sleepHours: 9, windDown: 30, morning: 45,
  sessionLen: 45, breakLen: 10, dailyCap: 180, bufferAfter: 15,
  school: { enabled: true, days: [1, 2, 3, 4, 5], start: '07:30', end: '14:30', travelBefore: 30, travelAfter: 30 },
};
const plan = (over = {}) => ({ settings: { ...baseSettings, ...(over.settings || {}) }, commitments: over.commitments || [], tasks: over.tasks || [] });
const task = (id, minutes, dueDate, dueTime = '08:00', extra = {}) => ({ id, title: id, minutes, dueDate, dueTime, priority: 'medium', flexible: true, ...extra });
const overlaps = (a, b) => Math.min(a.end, b.end) > Math.max(a.start, b.start);

function assertNoStudyInReserved(s) {
  for (const st of s.study) {
    for (const r of s.reserved) {
      assert.ok(!overlaps(st, r), `study ${st.title} ${fmtTime(st.start)} overlaps ${r.type} ${fmtTime(r.start)}`);
    }
  }
}

test('sleep crossing midnight is one continuous protected block', () => {
  const s = buildSchedule(plan({ settings: { wake: '06:30', sleepHours: 9 } }), { startDate: START, nowMin: 17 * 60 });
  const night = s.reserved.find((b) => b.type === 'sleep' && b.night === 1);
  assert.equal(night.start, 21 * 60 + 30); // Mon 21:30
  assert.equal(night.end, DAY + 6 * 60 + 30); // Tue 06:30
  assert.equal(night.end - night.start, 9 * 60);
});

test('late wake-up with sleep starting after midnight', () => {
  const s = buildSchedule(plan({ settings: { wake: '09:00', sleepHours: 8 } }), { startDate: START, nowMin: 0 });
  const night = s.reserved.find((b) => b.type === 'sleep' && b.night === 1);
  assert.equal(night.start, DAY + 60); // Tue 01:00
  assert.equal(night.end, DAY + 9 * 60);
});

test('overloaded evening never shortens sleep and keeps leftover work visible', () => {
  const p = plan({ tasks: [task('bio', 240, '2026-11-03', '08:00'), task('math', 120, '2026-11-03', '08:00')] });
  const s = buildSchedule(p, { startDate: START, nowMin: 17 * 60 });
  assertNoStudyInReserved(s);
  const tonight = s.study.filter((b) => b.end <= DAY);
  assert.ok(tonight.every((b) => b.end <= 21 * 60), 'study ends before wind-down at 21:00');
  assert.ok(s.unscheduled.length > 0);
  const scheduled = s.stats.scheduledStudyMin;
  assert.equal(scheduled + s.stats.remainingMin, 360);
});

test('deadline before the next available study slot is reported, not forced', () => {
  // Now is 23:00 Monday (inside sleep); due Tue 07:00 — before any free study time.
  const p = plan({ tasks: [task('essay', 60, '2026-11-03', '07:00')] });
  const s = buildSchedule(p, { startDate: START, nowMin: 23 * 60 });
  assert.equal(s.study.length, 0);
  assert.equal(s.unscheduled[0].reason, 'no-slot-before-deadline');
});

test('deadline already passed is reported as past', () => {
  const p = plan({ tasks: [task('old', 30, '2026-11-02', '09:00')] });
  const s = buildSchedule(p, { startDate: START, nowMin: 17 * 60 });
  assert.equal(s.unscheduled[0].reason, 'past');
});

test('conflicting fixed commitments are detected, including overnight ones', () => {
  const p = plan({
    commitments: [
      { id: 'a', title: 'Football', days: [1], start: '16:00', end: '18:00' },
      { id: 'b', title: 'Tutoring', days: [1], start: '17:00', end: '18:30' },
      { id: 'c', title: 'Late shift', days: [5], start: '20:00', end: '01:00' },
    ],
  });
  const s = buildSchedule(p, { startDate: START, nowMin: 0 });
  const overlap = s.conflicts.find((c) => c.kind === 'overlap');
  assert.ok(overlap);
  assert.equal(overlap.minutes, 60);
  const sleepConflict = s.conflicts.find((c) => c.kind === 'sleep' && c.a.commitmentId === 'c');
  assert.ok(sleepConflict, 'overnight shift overlapping sleep is flagged');
  assertNoStudyInReserved(s);
});

test('large tasks are split into sessions with breaks and daily cap', () => {
  const p = plan({ tasks: [task('project', 300, '2026-11-06', '08:00')] });
  const s = buildSchedule(p, { startDate: START, nowMin: 15 * 60 });
  assert.ok(s.study.length >= 6);
  for (const b of s.study) assert.ok(b.end - b.start <= 45);
  const perDay = {};
  for (const b of s.study) { const d = Math.floor(b.start / DAY); perDay[d] = (perDay[d] || 0) + (b.end - b.start); }
  for (const v of Object.values(perDay)) assert.ok(v <= 180);
  const sorted = [...s.study].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    if (Math.floor(sorted[i].start / DAY) === Math.floor(sorted[i - 1].start / DAY)) {
      assert.ok(sorted[i].start - sorted[i - 1].end >= 10, 'break between sessions');
    }
  }
  assert.equal(s.unscheduled.length, 0);
});

test('rewrite moves flexible work, splits essential work, never touches sleep', () => {
  const p = plan({
    tasks: [
      task('Biology notes', 120, '2026-11-03', '08:00', { priority: 'high' }),
      task('History reading', 60, '2026-11-05', '08:00', { priority: 'low' }),
    ],
  });
  const opts = { startDate: START, nowMin: 18 * 60 };
  const r = proposeRewrite(p, opts, ['Biology notes', 'History reading'], { 'Biology notes': 'tonight', 'History reading': 'move' });
  assert.equal(r.demand, 180);
  assert.ok(r.overBy > 0, 'current plan competes with protected time');
  const hist = r.changes.find((c) => c.taskId === 'History reading');
  assert.equal(hist.kind, 'move');
  assert.ok(hist.newLabel && !hist.newLabel.startsWith('Mon'));
  assertNoStudyInReserved(r.proposed);
  const sleepBefore = r.base.reserved.filter((b) => b.type === 'sleep').map((b) => [b.start, b.end]);
  const sleepAfter = r.proposed.reserved.filter((b) => b.type === 'sleep').map((b) => [b.start, b.end]);
  assert.deepEqual(sleepAfter, sleepBefore);
});

test('rewrite with "help" adds a question task', () => {
  const p = plan({ tasks: [task('Chem lab', 150, '2026-11-03', '08:00')] });
  const r = proposeRewrite(p, { startDate: START, nowMin: 19 * 60 }, ['Chem lab'], { 'Chem lab': 'help' });
  assert.ok(r.proposedPlan.tasks.find((t) => t.helpFor === 'Chem lab'));
});

test('pinned session is respected when valid and released when invalid', () => {
  const pinStart = DAY + 16 * 60; // Tue 16:00
  const p = plan({ tasks: [task('maths', 45, '2026-11-05', '08:00', { pins: [{ start: pinStart, minutes: 45 }] })] });
  const s = buildSchedule(p, { startDate: START, nowMin: 15 * 60 });
  assert.equal(s.study[0].start, pinStart);
  assert.ok(s.study[0].pinned);
  const p2 = plan({ tasks: [task('maths', 45, '2026-11-05', '08:00', { pins: [{ start: DAY + 10 * 60, minutes: 45 }] })] }); // during school
  const s2 = buildSchedule(p2, { startDate: START, nowMin: 15 * 60 });
  assert.equal(s2.notes.length, 1);
  assert.ok(!s2.study[0].pinned);
});

test('diffSchedules reports moved tasks', () => {
  const p = plan({ tasks: [task('a', 45, '2026-11-05')] });
  const s1 = buildSchedule(p, { startDate: START, nowMin: 15 * 60 });
  const p2 = plan({ tasks: [task('a', 45, '2026-11-05', '08:00', { notBefore: DAY * 2 })] });
  const s2 = buildSchedule(p2, { startDate: START, nowMin: 15 * 60 });
  const d = diffSchedules(s1, s2);
  assert.equal(d.length, 1);
  assert.ok(d[0].to > d[0].from);
});

test('helpers', () => {
  assert.equal(toMin('07:05'), 425);
  assert.ok(Number.isNaN(toMin('25:00')));
  assert.equal(fmtTime(DAY + 75), '01:15');
  assert.equal(absMinute(START, '2026-11-03', '01:00'), DAY + 60);
  assert.equal(validateTask({ title: '', minutes: 0, dueDate: 'x', dueTime: '' }).length, 4);
  const s = buildSchedule(plan(), { startDate: START, nowMin: 15 * 60 });
  const w = freeWindows(s, 15 * 60, 21 * 60);
  assert.ok(w.length >= 1 && w[0].start >= 15 * 60 + 15);
  const tw = tonightWindow(plan(), s);
  assert.equal(tw.protectStart, 21 * 60);
  assert.ok(findConflicts(reservedBlocks(plan(), START, 7), 7 * DAY).length === 0);
});

test('DST-safe day arithmetic', () => {
  assert.equal(absMinute('2026-03-28', '2026-03-30', '00:00'), 2 * DAY);
});

test('"planned for tonight" only claims tonight, not later days ahead of earlier deadlines', () => {
  const p = plan({
    tasks: [
      task('eng', 300, '2026-11-06', '08:00', { tonight: true }),
      task('chem', 90, '2026-11-04', '08:00'),
    ],
  });
  const s = buildSchedule(p, { startDate: START, nowMin: 20 * 60 }); // Mon 20:00, wind-down 21:00
  const tue = s.study.filter((b) => b.start >= DAY && b.start < 2 * DAY);
  assert.equal(tue[0].taskId, 'chem', 'earlier deadline comes first on Tuesday');
  assert.equal(s.study[0].taskId, 'eng', 'tonight goes to the task planned for tonight');
});
