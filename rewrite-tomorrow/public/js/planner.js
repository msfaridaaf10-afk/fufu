// Sleep-protecting study planner: settings, commitments, tasks, weekly calendar,
// agenda, conflicts, unscheduled work, moves with undo, and .ics export.
import { esc, $, $$, toast, openDialog, confirmDialog, fieldError, download, reducedMotion, inFrame } from './ui.js';
import { state, subscribe, getPlan, updatePlan, schedule, clock, undo, canUndo, isDemo, enterDemo } from './store.js';
import {
  DAY, toMin, fmtTime, fmtDuration, label, dayName, addDays, parseDate, absMinute,
  validateTask, validateCommitment, validateSettings, makeId, freeWindows, diffSchedules, tonightWindow,
} from './scheduler.js';

const WEEKDAYS = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun']];
const PRIORITY = { high: 'Must do', medium: 'Should do', low: 'Could do' };
const HOUR_PX = 44;

function dateLabel(startDate, i, opts = { weekday: 'long', day: 'numeric', month: 'short' }) {
  return new Date(parseDate(addDays(startDate, i))).toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' });
}

export function renderPlanner(el) {
  const ui = {
    view: state.prefs.view === 'week' || state.prefs.view === 'agenda' ? state.prefs.view : window.matchMedia('(max-width: 760px)').matches ? 'agenda' : 'week',
    setupOpen: null,
    gridScroll: null,
  };

  const draw = () => {
    const plan = getPlan();
    const sched = schedule(plan);
    const c = clock();
    if (ui.setupOpen === null) ui.setupOpen = !plan.tasks.length && !isDemo();
    const prevGrid = $('.week-scroll', el);
    if (prevGrid) ui.gridScroll = prevGrid.scrollTop;

    el.innerHTML = `
    <div class="planner">
      <div class="page-head planner-head">
        <div>
          <p class="kicker evidence-label">Study planner</p>
          <h1>Plan my week</h1>
          <p class="lede">Sleep and fixed commitments go in first. Study fits around them — never on top of them.</p>
        </div>
        <div class="planner-tools">
          <button class="btn btn-secondary" type="button" id="undo-btn" ${canUndo() ? '' : 'disabled'}>Undo</button>
          <a class="btn btn-primary" href="#rewrite">Rewrite this evening</a>
        </div>
      </div>
      ${!isDemo() && !plan.tasks.length ? `<p class="empty-callout paper-card">Start with your sleep and school times below, then add a task. Want to see how it works first? <button class="btn btn-quiet btn-small" type="button" id="pl-sample">Explore a sample day</button></p>` : ''}

      ${statsHTML(sched, plan, c)}
      ${attentionHTML(sched, plan, c)}

      <details class="paper-sheet setup" id="setup" ${ui.setupOpen ? 'open' : ''}>
        <summary><span class="summary-title">Sleep, school &amp; study settings</span><span class="summary-meta">Wake ${esc(plan.settings.wake)} · ${plan.settings.sleepHours} h sleep opportunity · ${esc(fmtTime(toMin(plan.settings.wake) - plan.settings.sleepHours * 60))} lights out</span></summary>
        ${settingsHTML(plan)}
      </details>

      <div class="plan-columns">
        <section class="paper-sheet" aria-labelledby="tasks-h">
          <div class="section-head"><h2 id="tasks-h">Assignments &amp; tasks</h2><button class="btn btn-primary btn-small" type="button" id="add-task">Add a task</button></div>
          ${tasksHTML(plan, sched, c)}
        </section>
        <section class="paper-sheet" aria-labelledby="com-h">
          <div class="section-head"><h2 id="com-h">Fixed commitments</h2><button class="btn btn-secondary btn-small" type="button" id="add-com">Add a commitment</button></div>
          ${commitmentsHTML(plan, sched)}
        </section>
      </div>

      <section class="calendar paper-sheet" aria-labelledby="cal-h">
        <div class="section-head">
          <h2 id="cal-h">Your week</h2>
          <div class="seg" role="group" aria-label="Calendar view">
            <button type="button" class="seg-btn" data-view="week" aria-pressed="${ui.view === 'week'}">Week</button>
            <button type="button" class="seg-btn" data-view="agenda" aria-pressed="${ui.view === 'agenda'}">Agenda</button>
          </div>
        </div>
        ${legendHTML()}
        ${ui.view === 'week' ? weekHTML(sched, c) : agendaHTML(sched, c)}
        <div class="export-row">
          <label class="check-inline"><input type="checkbox" id="exp-wind"> Include wind-down reminders</label>
          <button class="btn btn-secondary" type="button" id="export">${inFrame ? 'Copy calendar file (.ics)' : 'Export study sessions (.ics)'}</button>
          <p class="hint">The calendar file contains only your scheduled study sessions${'' /* and optional wind-down */} — no reflections or check-ins. Times use this device’s time zone (${esc(Intl.DateTimeFormat().resolvedOptions().timeZone || 'local')}).</p>
        </div>
      </section>
    </div>`;

    wire(plan, sched, c);
    const grid = $('.week-scroll', el);
    if (grid) {
      if (ui.gridScroll != null) grid.scrollTop = ui.gridScroll;
      else grid.scrollTop = 14 * HOUR_PX - 10;
    }
  };

  function wire(plan, sched, c) {
    $('#undo-btn', el).addEventListener('click', () => {
      const d = undo();
      if (d) toast(`Undone: ${d}`);
    });
    const sample = $('#pl-sample', el);
    if (sample) sample.addEventListener('click', () => { enterDemo(); draw(); toast('Sample day loaded — fictional data, kept separate from your own.'); });
    $('#setup', el).addEventListener('toggle', (e) => { ui.setupOpen = e.target.open; });
    wireSettings(plan);
    $('#add-task', el).addEventListener('click', () => taskDialog(null));
    $('#add-com', el).addEventListener('click', () => commitmentDialog(null));
    $$('[data-view]', el).forEach((b) => b.addEventListener('click', () => { ui.view = b.dataset.view; ui.gridScroll = null; draw(); }));
    $$('[data-edit-task]', el).forEach((b) => b.addEventListener('click', () => taskDialog(plan.tasks.find((t) => t.id === b.dataset.editTask))));
    $$('[data-done-task]', el).forEach((b) => b.addEventListener('click', () => {
      const t = plan.tasks.find((x) => x.id === b.dataset.doneTask);
      updatePlan((p) => { const x = p.tasks.find((y) => y.id === t.id); x.done = !x.done; }, t.done ? `Reopen “${t.title}”` : `Finish “${t.title}”`);
      toast(t.done ? `“${t.title}” is back on your list.` : `Marked “${t.title}” as done.`, { action: { label: 'Undo', fn: undo } });
    }));
    $$('[data-del-task]', el).forEach((b) => b.addEventListener('click', () => {
      const t = plan.tasks.find((x) => x.id === b.dataset.delTask);
      updatePlan((p) => { p.tasks = p.tasks.filter((x) => x.id !== t.id); }, `Delete “${t.title}”`);
      toast(`Deleted “${t.title}”.`, { action: { label: 'Undo', fn: undo } });
    }));
    $$('[data-edit-com]', el).forEach((b) => b.addEventListener('click', () => commitmentDialog(plan.commitments.find((x) => x.id === b.dataset.editCom))));
    $$('[data-del-com]', el).forEach((b) => b.addEventListener('click', () => {
      const cm = plan.commitments.find((x) => x.id === b.dataset.delCom);
      updatePlan((p) => { p.commitments = p.commitments.filter((x) => x.id !== cm.id); }, `Delete “${cm.title}”`);
      toast(`Deleted “${cm.title}”.`, { action: { label: 'Undo', fn: undo } });
    }));
    $$('[data-session]', el).forEach((b) => b.addEventListener('click', () => sessionDialog(b.dataset.session)));
    if (ui.view === 'week') enableDrag(plan, sched, c);
    $$('[data-fix]', el).forEach((b) => b.addEventListener('click', () => fixDialog(b.dataset.fix, b.dataset.task)));
    $$('[data-open-setup]', el).forEach((b) => b.addEventListener('click', () => { const d = $('#setup', el); d.open = true; d.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' }); $('input, select', d).focus(); }));
    $('#export', el).addEventListener('click', () => exportICS(sched, c, $('#exp-wind', el).checked));
  }

  // ------------------------------------------------------------ settings form
  function settingsHTML(plan) {
    const s = plan.settings;
    const sch = s.school;
    const opts = [];
    for (let h = 6; h <= 11; h += 0.5) opts.push(`<option value="${h}" ${Number(s.sleepHours) === h ? 'selected' : ''}>${fmtDuration(h * 60)}</option>`);
    const guidance = s.ageBand === '18+'
      ? 'For adults, general guidance is 7 or more hours of sleep per 24 hours.'
      : 'For ages 13–18, general guidance is 8–10 hours of sleep per 24 hours.';
    const below = (s.ageBand !== '18+' && s.sleepHours < 8) || (s.ageBand === '18+' && s.sleepHours < 7);
    return `
    <form id="settings-form" class="settings-grid" novalidate>
      <fieldset class="field-group span-2">
        <legend>Age band</legend>
        <div class="choices">
          ${[['13-15', '13–15'], ['16-18', '16–18'], ['18+', 'Over 18'], ['na', 'Prefer not to say']].map(([v, t]) => `<label class="choice"><input type="radio" name="ageBand" value="${v}" ${s.ageBand === v ? 'checked' : ''}><span>${t}</span></label>`).join('')}
        </div>
      </fieldset>
      <label class="field"><span class="field-label">Wake-up time</span><input type="time" name="wake" value="${esc(s.wake)}" required><span class="field-error" id="se-wake" data-error-for="wake" hidden></span></label>
      <label class="field"><span class="field-label">Sleep opportunity</span><select name="sleepHours">${opts.join('')}</select></label>
      <div class="info-note span-2" id="sleep-guidance">
        <p><strong>${guidance}</strong> The time you set here is your <em>sleep opportunity</em> — time protected for sleep. The sleep you actually get is usually a little less, because falling asleep and waking in the night take time. The planner never schedules work in this time.</p>
        ${below ? '<p>That’s less than the general guidance. Some weeks are tight — it’s your choice, and the planner will protect whatever you set.</p>' : ''}
        <p class="hint">Teenagers’ body clocks often shift later, so feeling awake late at night is common and not a character flaw.</p>
      </div>
      <label class="field"><span class="field-label">Wind-down before sleep (minutes)</span><input type="number" name="windDown" min="0" max="120" step="5" value="${s.windDown}"></label>
      <label class="field"><span class="field-label">Getting ready after waking (minutes)</span><input type="number" name="morning" min="0" max="180" step="5" value="${s.morning}"></label>

      <fieldset class="field-group span-2">
        <legend>School</legend>
        <label class="check-inline"><input type="checkbox" name="schoolEnabled" ${sch.enabled ? 'checked' : ''}> I have school this week</label>
        <div class="day-picks" role="group" aria-label="School days">
          ${WEEKDAYS.map(([d, n]) => `<label class="day-pick"><input type="checkbox" name="schoolDay" value="${d}" ${sch.days.includes(d) ? 'checked' : ''}><span>${n}</span></label>`).join('')}
        </div>
        <div class="row-fields">
          <label class="field"><span class="field-label">Starts</span><input type="time" name="schoolStart" value="${esc(sch.start)}"></label>
          <label class="field"><span class="field-label">Ends</span><input type="time" name="schoolEnd" value="${esc(sch.end)}"></label>
          <label class="field"><span class="field-label">Travel there (min)</span><input type="number" name="travelBefore" min="0" max="180" step="5" value="${sch.travelBefore}"></label>
          <label class="field"><span class="field-label">Travel home (min)</span><input type="number" name="travelAfter" min="0" max="180" step="5" value="${sch.travelAfter}"></label>
        </div>
        <span class="field-error" id="se-school" data-error-for="schoolStart" hidden></span>
      </fieldset>

      <fieldset class="field-group span-2">
        <legend>Study sessions</legend>
        <div class="row-fields">
          <label class="field"><span class="field-label">Session length (min)</span><input type="number" name="sessionLen" min="15" max="120" step="5" value="${s.sessionLen}"></label>
          <label class="field"><span class="field-label">Break between (min)</span><input type="number" name="breakLen" min="0" max="60" step="5" value="${s.breakLen}"></label>
          <label class="field"><span class="field-label">Most study per day (min)</span><input type="number" name="dailyCap" min="30" max="600" step="15" value="${s.dailyCap}"></label>
          <label class="field"><span class="field-label">Buffer after commitments (min)</span><input type="number" name="bufferAfter" min="0" max="60" step="5" value="${s.bufferAfter}"></label>
        </div>
      </fieldset>
    </form>`;
  }

  function wireSettings(plan) {
    const f = $('#settings-form', el);
    f.addEventListener('change', () => {
      const num = (n, d) => { const v = Number(f.elements[n].value); return Number.isFinite(v) && v >= 0 ? v : d; };
      const next = {
        ...plan.settings,
        ageBand: (f.querySelector('[name="ageBand"]:checked') || {}).value || plan.settings.ageBand,
        wake: f.elements.wake.value,
        sleepHours: Number(f.elements.sleepHours.value),
        windDown: num('windDown', 30),
        morning: num('morning', 45),
        sessionLen: Math.max(15, num('sessionLen', 45)),
        breakLen: num('breakLen', 10),
        dailyCap: Math.max(30, num('dailyCap', 180)),
        bufferAfter: num('bufferAfter', 15),
        school: {
          enabled: f.elements.schoolEnabled.checked,
          days: $$('[name="schoolDay"]:checked', f).map((i) => Number(i.value)),
          start: f.elements.schoolStart.value,
          end: f.elements.schoolEnd.value,
          travelBefore: num('travelBefore', 0),
          travelAfter: num('travelAfter', 0),
        },
      };
      const errs = validateSettings(next);
      fieldError(f, 'wake', (errs.find((e) => e.field === 'wake') || {}).msg);
      fieldError(f, 'schoolStart', (errs.find((e) => e.field === 'school') || {}).msg);
      if (errs.length) return;
      const focusName = document.activeElement && document.activeElement.name;
      updatePlan((p) => { p.settings = next; }, 'Change settings');
      if (focusName) { const again = $(`#settings-form [name="${focusName}"]`, el); if (again) again.focus(); }
    });
  }

  // ------------------------------------------------------------ dialogs
  function taskDialog(task) {
    const c = clock();
    const t = task || { title: '', minutes: 45, dueDate: addDays(c.startDate, 1), dueTime: '08:00', priority: 'medium', flexible: true, tonight: false };
    openDialog({
      title: task ? 'Edit task' : 'Add a task',
      build(b, close) {
        b.innerHTML = `
        <form class="stack" novalidate>
          <label class="field"><span class="field-label">What is it?</span><input name="title" maxlength="80" value="${esc(t.title)}" placeholder="e.g. Biology revision" required><span class="field-error" id="tf-title" data-error-for="title" hidden></span></label>
          <label class="field"><span class="field-label">Estimated time (minutes)</span><input name="minutes" type="number" min="5" max="1440" step="5" value="${esc(t.minutes)}" inputmode="numeric"><span class="hint">Your best guess is fine. Big tasks are split into sessions automatically.</span><span class="field-error" id="tf-min" data-error-for="minutes" hidden></span></label>
          <div class="row-fields">
            <label class="field"><span class="field-label">Due date</span><input name="dueDate" type="date" value="${esc(t.dueDate)}"><span class="field-error" id="tf-dd" data-error-for="dueDate" hidden></span></label>
            <label class="field"><span class="field-label">Due time</span><input name="dueTime" type="time" value="${esc(t.dueTime)}"><span class="field-error" id="tf-dt" data-error-for="dueTime" hidden></span></label>
          </div>
          <fieldset class="field-group"><legend>Priority</legend><div class="choices">
            ${Object.entries(PRIORITY).map(([v, n]) => `<label class="choice"><input type="radio" name="priority" value="${v}" ${t.priority === v ? 'checked' : ''}><span>${n}</span></label>`).join('')}
          </div></fieldset>
          <label class="check-inline"><input type="checkbox" name="flexible" ${t.flexible !== false ? 'checked' : ''}> This can move to another day if needed</label>
          <label class="check-inline"><input type="checkbox" name="tonight" ${t.tonight ? 'checked' : ''}> I was planning to work on this tonight</label>
          <div class="btn-row"><button class="btn btn-primary" type="submit">${task ? 'Save changes' : 'Add task'}</button><button class="btn btn-secondary" type="button" data-cancel>Cancel</button></div>
        </form>`;
        const f = $('form', b);
        $('[data-cancel]', b).addEventListener('click', () => close());
        f.addEventListener('submit', (e) => {
          e.preventDefault();
          const v = {
            title: f.elements.title.value.trim(),
            minutes: Number(f.elements.minutes.value),
            dueDate: f.elements.dueDate.value,
            dueTime: f.elements.dueTime.value,
            priority: (f.querySelector('[name="priority"]:checked') || {}).value || 'medium',
            flexible: f.elements.flexible.checked,
            tonight: f.elements.tonight.checked,
          };
          const errs = validateTask(v);
          ['title', 'minutes', 'dueDate', 'dueTime'].forEach((n) => fieldError(f, n, (errs.find((x) => x.field === n) || {}).msg));
          if (errs.length) { f.querySelector('[aria-invalid="true"]').focus(); return; }
          if (task) {
            updatePlan((p) => { const x = p.tasks.find((y) => y.id === task.id); Object.assign(x, v); if (x.minutes !== task.minutes || x.dueDate !== task.dueDate) x.pins = []; }, `Edit “${v.title}”`);
            toast(`Saved “${v.title}”.`, { action: { label: 'Undo', fn: undo } });
          } else {
            updatePlan((p) => { p.tasks.push({ id: makeId('t'), ...v, pins: [] }); }, `Add “${v.title}”`);
            toast(`Added “${v.title}”.`, { action: { label: 'Undo', fn: undo } });
          }
          close(true);
        });
      },
    });
  }

  function commitmentDialog(cm) {
    const v0 = cm || { title: '', days: [], start: '16:00', end: '17:00' };
    const oneOff = !!(cm && cm.date);
    const today = clock().startDate;
    openDialog({
      title: cm ? 'Edit commitment' : 'Add a fixed commitment',
      build(b, close) {
        b.innerHTML = `
        <form class="stack" novalidate>
          <label class="field"><span class="field-label">What is it?</span><input name="title" maxlength="60" value="${esc(v0.title)}" placeholder="e.g. Football, work shift, family dinner"><span class="field-error" id="cf-t" data-error-for="title" hidden></span></label>
          <fieldset class="field-group"><legend>How often?</legend>
            <div class="choices">
              <label class="choice"><input type="radio" name="kind" value="weekly" ${oneOff ? '' : 'checked'}><span>Every week</span></label>
              <label class="choice"><input type="radio" name="kind" value="once" ${oneOff ? 'checked' : ''}><span>Just once</span></label>
            </div>
          </fieldset>
          <fieldset class="field-group" data-when="weekly" ${oneOff ? 'hidden' : ''}><legend>Which days?</legend>
            <div class="day-picks">${WEEKDAYS.map(([d, n]) => `<label class="day-pick"><input type="checkbox" name="day" value="${d}" ${(v0.days || []).includes(d) ? 'checked' : ''}><span>${n}</span></label>`).join('')}</div>
            <span class="field-error" id="cf-d" data-error-for="day" hidden></span>
          </fieldset>
          <label class="field" data-when="once" ${oneOff ? '' : 'hidden'}><span class="field-label">Date</span><input name="date" type="date" value="${esc(v0.date || today)}"><span class="field-error" id="cf-date" data-error-for="date" hidden></span></label>
          <div class="row-fields">
            <label class="field"><span class="field-label">Starts</span><input name="start" type="time" value="${esc(v0.start)}"></label>
            <label class="field"><span class="field-label">Ends</span><input name="end" type="time" value="${esc(v0.end)}"><span class="hint">An end time earlier than the start means it finishes after midnight.</span></label>
          </div>
          <span class="field-error" id="cf-time" data-error-for="start" hidden></span>
          <div class="btn-row"><button class="btn btn-primary" type="submit">${cm ? 'Save changes' : 'Add commitment'}</button><button class="btn btn-secondary" type="button" data-cancel>Cancel</button></div>
        </form>`;
        const f = $('form', b);
        $('[data-cancel]', b).addEventListener('click', () => close());
        const kind = () => f.querySelector('[name="kind"]:checked').value;
        f.addEventListener('change', (e) => {
          if (e.target.name !== 'kind') return;
          $$('[data-when]', f).forEach((x) => { x.hidden = x.dataset.when !== kind(); });
        });
        f.addEventListener('submit', (e) => {
          e.preventDefault();
          const once = kind() === 'once';
          const v = { title: f.elements.title.value.trim(), days: once ? [] : $$('[name="day"]:checked', f).map((i) => Number(i.value)), date: once ? f.elements.date.value : null, start: f.elements.start.value, end: f.elements.end.value };
          if (!once) delete v.date;
          const errs = validateCommitment(v);
          if (!once) v.date = undefined;
          fieldError(f, 'title', (errs.find((x) => x.field === 'title') || {}).msg);
          fieldError(f, 'date', (errs.find((x) => x.field === 'date') || {}).msg);
          fieldError(f, 'day', (errs.find((x) => x.field === 'days') || {}).msg);
          fieldError(f, 'start', (errs.find((x) => x.field === 'time') || {}).msg);
          if (errs.length) return;
          if (cm) updatePlan((p) => { const x = p.commitments.find((y) => y.id === cm.id); Object.assign(x, v); if (!once) delete x.date; }, `Edit “${v.title}”`);
          else updatePlan((p) => { p.commitments.push({ id: makeId('c'), ...v }); }, `Add “${v.title}”`);
          toast(cm ? `Saved “${v.title}”.` : `Added “${v.title}”.`, { action: { label: 'Undo', fn: undo } });
          close(true);
        });
      },
    });
  }

  function moveSession(task, st, to, before) {
    const c = clock();
    const len = st.end - st.start;
    updatePlan((p) => {
      const x = p.tasks.find((y) => y.id === task.id);
      x.pins = (x.pins || []).filter((pin) => pin.start !== st.start);
      x.pins.push({ start: to, minutes: len });
    }, `Move “${task.title}”`, { move: { taskId: task.id, from: st.start, fromEnd: st.end, to, at: Date.now() } });
    const after = schedule();
    const others = diffSchedules(before, after).filter((d) => d.taskId !== task.id);
    toast(`Moved “${task.title}” from ${label(c.startDate, st.start)} to ${label(c.startDate, to)}.${others.length ? ` ${others.length} other session${others.length > 1 ? 's' : ''} shifted to make room.` : ''}`, { action: { label: 'Undo', fn: undo } });
  }

  // Optional mouse/pen dragging in the week view. Every move is also possible from
  // the session dialog (click or Enter), which is the accessible route.
  function enableDrag(plan, sched, c) {
    const cols = $$('.day-col', el);
    if (!cols.length) return;
    const px = HOUR_PX / 60;
    const SL = 5;
    let drag = null;
    let suppressClick = false;

    // Free slots as if this session (and its trailing break) were not there.
    const maskWithout = (st) => {
      const mask = Uint8Array.from(sched.freeMask);
      const brk = Math.round((plan.settings.breakLen || 0) / SL);
      for (let i = st.start / SL; i < st.end / SL + brk && i < mask.length; i++) {
        if (i < st.end / SL || mask[i] === 2) mask[i] = sched.availableMask[i] === 1 ? 1 : mask[i];
      }
      return mask;
    };
    const canPlace = (st, mask, start) => {
      const task = plan.tasks.find((t) => t.id === st.taskId);
      const due = absMinute(c.startDate, task.dueDate, task.dueTime);
      const len = st.end - st.start;
      if (start < sched.nowMin || start + len > Math.min(due, sched.days * DAY)) return false;
      for (let i = start / SL; i < (start + len) / SL; i++) if (mask[i] !== 1) return false;
      return true;
    };
    const clearPreview = () => { const pv = $('.drop-preview', el); if (pv) pv.parentElement.removeChild(pv); };

    $$('.blk-study', el).forEach((blk) => {
      blk.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || e.pointerType === 'touch') return; // touch keeps normal scrolling; tap opens the dialog
        const st = sched.study.find((b) => b.id === blk.dataset.session);
        drag = { blk, st, mask: maskWithout(st), x: e.clientX, y: e.clientY, grab: e.clientY - blk.getBoundingClientRect().top, moved: false, target: null };
        blk.setPointerCapture(e.pointerId);
      });
      blk.addEventListener('pointermove', (e) => {
        if (!drag || drag.blk !== blk) return;
        if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
        drag.moved = true;
        blk.classList.add('is-dragging');
        blk.style.transform = `translate(${e.clientX - drag.x}px, ${e.clientY - drag.y}px)`;
        const col = cols.find((cc) => { const r = cc.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right; });
        if (!col) { clearPreview(); drag.target = null; return; }
        const day = cols.indexOf(col);
        const r = col.getBoundingClientRect();
        const len = drag.st.end - drag.st.start;
        let min = Math.round(((e.clientY - drag.grab - r.top) / px) / SL) * SL;
        min = Math.max(0, Math.min(DAY - len, min));
        const start = day * DAY + min;
        const ok = canPlace(drag.st, drag.mask, start);
        let pv = $('.drop-preview', el);
        if (!pv) { pv = document.createElement('div'); pv.className = 'drop-preview'; pv.setAttribute('aria-hidden', 'true'); }
        if (pv.parentElement !== col) col.append(pv);
        pv.style.top = `${min * px}px`;
        pv.style.height = `${len * px - 2}px`;
        pv.classList.toggle('is-bad', !ok);
        pv.textContent = ok ? `${fmtTime(start)}–${fmtTime(start + len)}` : 'Not free';
        drag.target = ok ? start : null;
      });
      const end = () => {
        if (!drag || drag.blk !== blk) return;
        const d = drag;
        drag = null;
        blk.classList.remove('is-dragging');
        blk.style.transform = '';
        clearPreview();
        if (!d.moved) return;
        suppressClick = true;
        setTimeout(() => { suppressClick = false; }, 0);
        if (d.target == null) { toast('That time isn’t free — sleep, wind-down and commitments stay protected.'); return; }
        if (d.target === d.st.start) return;
        const task = getPlan().tasks.find((t) => t.id === d.st.taskId);
        moveSession(task, d.st, d.target, sched);
      };
      blk.addEventListener('pointerup', end);
      blk.addEventListener('pointercancel', end);
      blk.addEventListener('click', (e) => { if (suppressClick) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
    });
  }

  function sessionDialog(sessionId) {
    const plan = getPlan();
    const sched = schedule(plan);
    const c = clock();
    const st = sched.study.find((b) => b.id === sessionId);
    if (!st) return;
    const task = plan.tasks.find((t) => t.id === st.taskId);
    const sessions = sched.study.filter((b) => b.taskId === task.id);
    const idx = sessions.indexOf(st) + 1;
    const len = st.end - st.start;
    const due = absMinute(c.startDate, task.dueDate, task.dueTime);
    const windows = freeWindows(sched, sched.nowMin, Math.min(due, 7 * DAY), len)
      .flatMap((w) => {
        const out = [];
        for (let s = w.start; s + len <= w.end && out.length < 2; s += Math.max(len, 60)) out.push(s);
        return out;
      })
      .slice(0, 14);

    openDialog({
      title: task.title,
      build(b, close) {
        b.innerHTML = `
        <p><strong>${esc(label(c.startDate, st.start, true))}–${esc(fmtTime(st.end))}</strong> · session ${idx} of ${sessions.length} · ${fmtDuration(len)}${st.pinned ? ' · placed by you' : ''}</p>
        <p class="hint">Due ${esc(label(c.startDate, due, true))}. ${esc(PRIORITY[task.priority] || '')}${task.flexible === false ? ' · not flexible' : ''}</p>
        <form class="stack" id="move-form">
          <fieldset class="field-group"><legend>Move this session to an open time</legend>
            ${windows.length
              ? `<div class="slot-list">${windows.map((s, i) => `<label class="choice slot"><input type="radio" name="slot" value="${s}" ${i === 0 ? '' : ''}><span>${esc(label(c.startDate, s, true))}–${esc(fmtTime(s + len))}</span></label>`).join('')}</div>`
              : '<p>There’s no open time of this length before it’s due. You could shorten the task, or move something flexible.</p>'}
          </fieldset>
          <p class="form-error" id="mv-err" role="alert" hidden></p>
          <div class="btn-row">
            ${windows.length ? '<button class="btn btn-primary" type="submit">Move session</button>' : ''}
            ${st.pinned ? '<button class="btn btn-secondary" type="button" data-unpin>Let the planner choose</button>' : ''}
            <button class="btn btn-secondary" type="button" data-edit>Edit task</button>
            <button class="btn btn-quiet" type="button" data-done>Mark task done</button>
          </div>
        </form>`;
        const f = $('#move-form', b);
        f.addEventListener('submit', (e) => {
          e.preventDefault();
          const pick = f.querySelector('[name="slot"]:checked');
          if (!pick) { const er = $('#mv-err', b); er.textContent = 'Choose a new time first.'; er.hidden = false; return; }
          moveSession(task, st, Number(pick.value), sched);
          close(true);
        });
        const unpin = $('[data-unpin]', b);
        if (unpin) unpin.addEventListener('click', () => { updatePlan((p) => { const x = p.tasks.find((y) => y.id === task.id); x.pins = (x.pins || []).filter((pin) => pin.start !== st.start); }, `Reset “${task.title}”`); close(); });
        $('[data-edit]', b).addEventListener('click', () => { close(); setTimeout(() => taskDialog(task), 0); });
        $('[data-done]', b).addEventListener('click', () => { updatePlan((p) => { p.tasks.find((y) => y.id === task.id).done = true; }, `Finish “${task.title}”`); toast(`Marked “${task.title}” as done.`, { action: { label: 'Undo', fn: undo } }); close(); });
      },
    });
  }

  // Actions offered when work doesn't fit.
  function fixDialog(kind, taskId) {
    const plan = getPlan();
    const task = plan.tasks.find((t) => t.id === taskId);
    const sched = schedule(plan);
    const c = clock();
    const u = sched.unscheduled.find((x) => x.taskId === taskId);
    if (!task) return;
    const due = absMinute(c.startDate, task.dueDate, task.dueTime);

    if (kind === 'part') {
      openDialog({
        title: 'Choose the most important part',
        build(b, close) {
          const scheduled = Number(task.minutes) - (u ? u.minutes : 0);
          b.innerHTML = `
          <p>“${esc(task.title)}” needs ${fmtDuration(task.minutes)}, and ${fmtDuration(scheduled)} fits before it’s due. What’s the part that matters most?</p>
          <form class="stack" novalidate>
            <label class="field"><span class="field-label">Essential part (minutes)</span><input name="m" type="number" min="5" step="5" max="${task.minutes}" value="${Math.max(5, Math.floor(scheduled / 5) * 5) || 5}"></label>
            <label class="field"><span class="field-label">What is it? (optional)</span><input name="t" maxlength="60" placeholder="e.g. Key diagrams only"></label>
            <fieldset class="field-group"><legend>The rest</legend>
              <label class="choice"><input type="radio" name="rest" value="later" checked><span>Keep it as a separate task with a later date</span></label>
              <label class="choice"><input type="radio" name="rest" value="drop"><span>Let it go for now</span></label>
              <label class="field"><span class="field-label">Later date for the rest</span><input type="date" name="d" value="${addDays(task.dueDate, 2)}"></label>
            </fieldset>
            <div class="btn-row"><button class="btn btn-primary" type="submit">Apply</button><button class="btn btn-secondary" type="button" data-cancel>Cancel</button></div>
          </form>`;
          const f = $('form', b);
          $('[data-cancel]', b).addEventListener('click', () => close());
          f.addEventListener('submit', (e) => {
            e.preventDefault();
            const m = Math.min(Number(task.minutes), Math.max(5, Number(f.elements.m.value) || 5));
            const rest = Number(task.minutes) - m;
            const keep = f.querySelector('[name="rest"]:checked').value === 'later';
            const name = f.elements.t.value.trim();
            updatePlan((p) => {
              const x = p.tasks.find((y) => y.id === task.id);
              x.minutes = m;
              x.title = name ? `${task.title}: ${name}` : `${task.title} — essential part`;
              x.priority = 'high';
              x.pins = [];
              if (keep && rest > 0) p.tasks.push({ ...task, id: makeId('t'), title: `${task.title} — the rest`, minutes: rest, dueDate: f.elements.d.value || addDays(task.dueDate, 2), priority: 'low', flexible: true, tonight: false, pins: [] });
            }, `Focus “${task.title}”`);
            toast('Updated. The essential part comes first.', { action: { label: 'Undo', fn: undo } });
            close();
          });
        },
      });
    } else if (kind === 'move') {
      // Flexible tasks with sessions before this deadline can step aside.
      const candidates = plan.tasks.filter((t) => t.id !== task.id && !t.done && t.flexible !== false
        && sched.study.some((s) => s.taskId === t.id && s.start < due)
        && absMinute(c.startDate, t.dueDate, t.dueTime) > due);
      openDialog({
        title: 'Move a flexible task',
        build(b, close) {
          b.innerHTML = candidates.length ? `
            <p>These flexible tasks are using time before “${esc(task.title)}” is due, and aren’t due until later. Moving one starts it after ${esc(label(c.startDate, due))}.</p>
            <form class="stack"><fieldset class="field-group"><legend>Which can move?</legend>
              ${candidates.map((t, i) => `<label class="choice"><input type="radio" name="t" value="${t.id}" ${i === 0 ? 'checked' : ''}><span>${esc(t.title)} · due ${esc(label(c.startDate, absMinute(c.startDate, t.dueDate, t.dueTime)))}</span></label>`).join('')}
            </fieldset><div class="btn-row"><button class="btn btn-primary" type="submit">Move it</button><button class="btn btn-secondary" type="button" data-cancel>Cancel</button></div></form>`
            : `<p>No flexible task is using time before this deadline. You could choose the most important part, or plan to ask for help or more time.</p><div class="btn-row"><button class="btn btn-secondary" type="button" data-cancel>Close</button></div>`;
          $('[data-cancel]', b).addEventListener('click', () => close());
          const f = $('form', b);
          if (f) f.addEventListener('submit', (e) => {
            e.preventDefault();
            const id = f.querySelector('[name="t"]:checked').value;
            const mt = plan.tasks.find((t) => t.id === id);
            const before = schedule();
            const was = before.study.find((s) => s.taskId === id);
            updatePlan((p) => { const x = p.tasks.find((y) => y.id === id); x.notBefore = due; x.pins = []; }, `Move “${mt.title}”`);
            const now = schedule().study.find((s) => s.taskId === id);
            if (was && now) { state.lastMove = { taskId: id, from: was.start, fromEnd: was.end, to: now.start, at: Date.now() }; draw(); }
            toast(`Moved “${mt.title}”${was ? ` from ${label(c.startDate, was.start)}` : ''}${now ? ` to ${label(c.startDate, now.start)}` : ''}.`, { action: { label: 'Undo', fn: undo } });
            close();
          });
        },
      });
    } else if (kind === 'split') {
      openDialog({
        title: 'Break this into smaller steps',
        build(b, close) {
          const n = 3;
          const each = Math.max(5, Math.round(task.minutes / n / 5) * 5);
          b.innerHTML = `
          <p>Smaller steps are easier to start, and each can have its own deadline.</p>
          <form class="stack" novalidate>
            ${Array.from({ length: n }, (_, i) => `
              <div class="row-fields step-row">
                <label class="field grow"><span class="field-label">Step ${i + 1}</span><input name="t${i}" maxlength="60" value="${esc(`${task.title} — step ${i + 1}`)}"></label>
                <label class="field"><span class="field-label">Minutes</span><input name="m${i}" type="number" min="0" step="5" value="${i === n - 1 ? Math.max(5, task.minutes - each * (n - 1)) : each}"></label>
                <label class="field"><span class="field-label">Due</span><input name="d${i}" type="date" value="${esc(task.dueDate)}"></label>
              </div>`).join('')}
            <p class="hint">Set a step’s minutes to 0 to leave it out.</p>
            <div class="btn-row"><button class="btn btn-primary" type="submit">Split task</button><button class="btn btn-secondary" type="button" data-cancel>Cancel</button></div>
          </form>`;
          const f = $('form', b);
          $('[data-cancel]', b).addEventListener('click', () => close());
          f.addEventListener('submit', (e) => {
            e.preventDefault();
            const steps = [];
            for (let i = 0; i < n; i++) {
              const m = Number(f.elements[`m${i}`].value);
              if (m >= 5) steps.push({ ...task, id: makeId('t'), title: f.elements[`t${i}`].value.trim() || `${task.title} — step ${i + 1}`, minutes: m, dueDate: f.elements[`d${i}`].value || task.dueDate, pins: [], tonight: false });
            }
            if (!steps.length) return;
            updatePlan((p) => { const at = p.tasks.findIndex((y) => y.id === task.id); p.tasks.splice(at, 1, ...steps); }, `Split “${task.title}”`);
            toast(`Split into ${steps.length} steps.`, { action: { label: 'Undo', fn: undo } });
            close();
          });
        },
      });
    } else if (kind === 'help') {
      openDialog({
        title: 'Plan to ask for help or an extension',
        build(b, close) {
          b.innerHTML = `
          <p>Asking early is a normal, sensible thing to do. This adds a short task to prepare what you’ll say, as early as possible.</p>
          <form class="stack">
            <label class="field"><span class="field-label">Who will you ask?</span><input name="who" maxlength="40" value="my teacher"></label>
            <p class="hint">You could say: “I’ve planned my week and ${esc(task.title)} needs more time than I have before the deadline. Could we talk about which parts matter most, or whether I could have more time?”</p>
            <div class="btn-row"><button class="btn btn-primary" type="submit">Add the task</button><button class="btn btn-secondary" type="button" data-cancel>Cancel</button></div>
          </form>`;
          const f = $('form', b);
          $('[data-cancel]', b).addEventListener('click', () => close());
          f.addEventListener('submit', (e) => {
            e.preventDefault();
            const who = f.elements.who.value.trim() || 'my teacher';
            updatePlan((p) => {
              const x = p.tasks.find((y) => y.id === task.id);
              x.askHelp = who;
              p.tasks.push({ id: makeId('t'), title: `Prepare a question for ${who} about “${task.title}”`, minutes: 10, dueDate: task.dueDate, dueTime: task.dueTime, priority: 'high', flexible: false, tonight: false, pins: [], helpFor: task.id });
            }, `Plan to ask about “${task.title}”`);
            toast('Added. If you get more time, edit the due date and the plan will update.', { action: { label: 'Undo', fn: undo } });
            close();
          });
        },
      });
    } else if (kind === 'edit') {
      taskDialog(task);
    }
  }

  const unsub = subscribe((e) => { if (e.type === 'plan' || e.type === 'mode' || e.type === 'reset') draw(); });
  draw();
  return unsub;
}

// ------------------------------------------------------------ HTML pieces
function statsHTML(sched, plan, c) {
  const tw = tonightWindow(plan, sched);
  const s = sched.stats;
  return `
  <dl class="stats" aria-label="This week in numbers">
    <div class="stat"><dt>Study time available this week</dt><dd>${fmtDuration(s.availableStudyMin)}</dd></div>
    <div class="stat"><dt>Study scheduled</dt><dd>${fmtDuration(s.scheduledStudyMin)}</dd></div>
    <div class="stat ${s.remainingMin ? 'stat-attn' : 'stat-ok'}"><dt>Work still needing time</dt><dd>${s.remainingMin ? fmtDuration(s.remainingMin) : 'None'}</dd></div>
    <div class="stat"><dt>Sleep opportunity each night</dt><dd>${fmtDuration(s.sleepOpportunityMin)}<span class="stat-sub">${tw.sleepStart != null ? `${fmtTime(tw.sleepStart)} → ${fmtTime(tw.sleepEnd)}` : ''}</span></dd></div>
  </dl>`;
}

function reasonText(u, sched, c) {
  const dueL = label(c.startDate, u.due);
  if (u.reason === 'past') return `The due time (${dueL}) has already passed. Change the date, or mark it done.`;
  if (u.reason === 'no-slot-before-deadline') {
    const next = freeWindows(sched, sched.nowMin, 7 * DAY, 20)[0];
    return `It’s due ${dueL}, before your next open study time${next ? ` (${label(c.startDate, next.start)})` : ''}.`;
  }
  return `${fmtDuration(u.minutes)} still needs a place before it’s due (${dueL}).`;
}

function attentionHTML(sched, plan, c) {
  const items = [];
  if (sched.unscheduled.length) {
    items.push(`
    <div class="attn-block">
      <h2 class="attn-title">This plan needs more time than you have available.</h2>
      <p>Your sleep time stays protected. Here’s what still needs a place, and some options:</p>
      <ul class="attn-list" role="list">
        ${sched.unscheduled.map((u) => {
          const t = plan.tasks.find((x) => x.id === u.taskId);
          return `<li class="attn-item">
            <p><strong>${esc(u.title)}</strong> — ${esc(reasonText(u, sched, c))}${t && t.askHelp ? ` <span class="tag tag-sage">You plan to ask ${esc(t.askHelp)}</span>` : ''}</p>
            <div class="btn-row">
              ${u.reason === 'past'
                ? `<button class="btn btn-secondary btn-small" type="button" data-fix="edit" data-task="${u.taskId}">Change the date</button>`
                : `<button class="btn btn-secondary btn-small" type="button" data-fix="part" data-task="${u.taskId}">Choose the most important part</button>
                   <button class="btn btn-secondary btn-small" type="button" data-fix="move" data-task="${u.taskId}">Move a flexible task</button>
                   <button class="btn btn-secondary btn-small" type="button" data-fix="split" data-task="${u.taskId}">Break this into smaller steps</button>
                   <button class="btn btn-secondary btn-small" type="button" data-fix="help" data-task="${u.taskId}">Plan to ask for help or an extension</button>`}
            </div></li>`;
        }).join('')}
      </ul>
    </div>`);
  }
  const groups = groupConflicts(sched, c);
  if (groups.length) {
    items.push(`
    <div class="attn-block">
      <h2 class="attn-title">Some times overlap</h2>
      <ul class="attn-list" role="list">
        ${groups.map((g) => `<li class="attn-item"><p>${esc(g.text)}</p><div class="btn-row">${g.actions}</div></li>`).join('')}
      </ul>
    </div>`);
  }
  if (sched.notes.length) {
    items.push(`<div class="attn-block"><ul class="attn-list" role="list">${sched.notes.map((n) => `<li class="attn-item"><p>${esc(n.msg)}</p></li>`).join('')}</ul></div>`);
  }
  if (!items.length) {
    if (!plan.tasks.filter((t) => !t.done).length) return '';
    return `<div class="all-fits paper-card"><span class="quiet-check-sm" aria-hidden="true">✓</span> <p>Everything fits around your sleep and commitments.</p></div>`;
  }
  return `<section class="attention paper-sheet" aria-label="Things to look at">${items.join('')}</section>`;
}

function groupConflicts(sched, c) {
  const map = new Map();
  for (const x of sched.conflicts) {
    const key = `${x.kind}|${x.a.commitmentId || x.a.type}|${x.b.commitmentId || x.b.type}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(x);
  }
  const out = [];
  for (const list of map.values()) {
    const x = list[0];
    const days = [...new Set(list.map((y) => dayName(c.startDate, Math.floor(y.start / DAY))))].join(', ');
    const nameA = x.a.title;
    const act = (blk) => (blk.commitmentId ? `<button class="btn btn-secondary btn-small" type="button" data-edit-com="${blk.commitmentId}">Edit ${esc(blk.title)}</button>` : '<button class="btn btn-secondary btn-small" type="button" data-open-setup>Edit school times</button>');
    if (x.kind === 'overlap') {
      out.push({ text: `${nameA} (${fmtTime(x.a.start)}–${fmtTime(x.a.end)}) overlaps ${x.b.title} (${fmtTime(x.b.start)}–${fmtTime(x.b.end)}) by ${fmtDuration(x.minutes)} on ${days}. Both are kept on your calendar; you may need to choose one.`, actions: act(x.a) + act(x.b) });
    } else {
      const what = x.kind === 'sleep' ? 'your protected sleep opportunity' : 'your wind-down time';
      out.push({ text: `${nameA} (${fmtTime(x.a.start)}–${fmtTime(x.a.end)}) overlaps ${what} by ${fmtDuration(x.minutes)} on ${days}. Your sleep time hasn’t been changed — no study will be placed there.`, actions: act(x.a) + '<button class="btn btn-quiet btn-small" type="button" data-open-setup>Adjust sleep settings</button>' });
    }
  }
  return out;
}

function tasksHTML(plan, sched, c) {
  if (!plan.tasks.length) return '<p class="empty">No tasks yet. Add assignments, revision or anything with a deadline.</p>';
  const open = plan.tasks.filter((t) => !t.done);
  const done = plan.tasks.filter((t) => t.done);
  const row = (t) => {
    const sessions = sched.study.filter((b) => b.taskId === t.id);
    const u = sched.unscheduled.find((x) => x.taskId === t.id);
    const due = absMinute(c.startDate, t.dueDate, t.dueTime);
    const moved = state.lastMove && state.lastMove.taskId === t.id;
    return `<li class="task-row ${t.done ? 'is-done' : ''}">
      <div class="task-main">
        <p class="task-title">${esc(t.title)}</p>
        <p class="task-meta">${fmtDuration(t.minutes)} · due ${esc(Number.isNaN(due) ? t.dueDate : label(c.startDate, due))} · <span class="tag tag-${t.priority}">${esc(PRIORITY[t.priority] || 'Should do')}</span>${t.flexible !== false ? ' <span class="tag">Flexible</span>' : ''}${t.tonight ? ' <span class="tag tag-lav">Planned for tonight</span>' : ''}</p>
        ${t.done ? '' : sessions.length ? `<p class="task-sched">Scheduled: ${sessions.slice(0, 3).map((s) => esc(label(c.startDate, s.start))).join(', ')}${sessions.length > 3 ? ` +${sessions.length - 3} more` : ''}</p>` : ''}
        ${moved ? `<p class="task-moved">Moved from ${esc(label(c.startDate, state.lastMove.from))} to ${esc(label(c.startDate, state.lastMove.to))}</p>` : ''}
        ${u ? `<p class="task-attn"><span aria-hidden="true">◐</span> ${esc(reasonText(u, sched, c))}</p>` : ''}
      </div>
      <div class="task-actions">
        <button class="btn btn-quiet btn-small" type="button" data-done-task="${t.id}" aria-label="${t.done ? 'Reopen' : 'Mark done'}: ${esc(t.title)}">${t.done ? 'Reopen' : 'Done'}</button>
        <button class="btn btn-quiet btn-small" type="button" data-edit-task="${t.id}" aria-label="Edit ${esc(t.title)}">Edit</button>
        <button class="btn btn-quiet btn-small" type="button" data-del-task="${t.id}" aria-label="Delete ${esc(t.title)}">Delete</button>
      </div></li>`;
  };
  return `<ul class="task-list" role="list">${open.map(row).join('')}</ul>${done.length ? `<details class="done-list"><summary>Done (${done.length})</summary><ul class="task-list" role="list">${done.map(row).join('')}</ul></details>` : ''}`;
}

function commitmentsHTML(plan, sched) {
  const school = plan.settings.school;
  const dayStr = (days) => WEEKDAYS.filter(([d]) => days.includes(d)).map(([, n]) => n).join(', ');
  const rows = plan.commitments.map((cm) => {
    const conflicts = sched.conflicts.filter((x) => x.a.commitmentId === cm.id || x.b.commitmentId === cm.id);
    const overnight = toMin(cm.end) <= toMin(cm.start);
    const when = cm.date ? `${dateLabel(cm.date, 0, { weekday: 'short', day: 'numeric', month: 'short' })} only` : dayStr(cm.days);
    const kinds = [...new Set(conflicts.map((x) => (x.kind === 'overlap' ? `overlaps ${x.a.commitmentId === cm.id ? x.b.title : x.a.title}` : x.kind === 'sleep' ? 'overlaps protected sleep' : 'overlaps wind-down')))];
    return `<li class="task-row">
      <div class="task-main"><p class="task-title">${esc(cm.title)}</p>
      <p class="task-meta">${esc(when)} · ${esc(cm.start)}–${esc(cm.end)}${overnight ? ' (ends after midnight)' : ''}</p>
      ${kinds.length ? `<p class="task-attn"><span aria-hidden="true">◐</span> ${esc(kinds.join('; '))}</p>` : ''}</div>
      <div class="task-actions"><button class="btn btn-quiet btn-small" type="button" data-edit-com="${cm.id}" aria-label="Edit ${esc(cm.title)}">Edit</button>
      <button class="btn btn-quiet btn-small" type="button" data-del-com="${cm.id}" aria-label="Delete ${esc(cm.title)}">Delete</button></div></li>`;
  });
  return `<ul class="task-list" role="list">
    ${school.enabled ? `<li class="task-row is-fixed"><div class="task-main"><p class="task-title">School</p><p class="task-meta">${esc(dayStr(school.days))} · ${esc(school.start)}–${esc(school.end)} · travel ${school.travelBefore} + ${school.travelAfter} min</p></div><div class="task-actions"><button class="btn btn-quiet btn-small" type="button" data-open-setup>Edit</button></div></li>` : ''}
    ${rows.join('')}
  </ul>${!plan.commitments.length ? '<p class="empty">Add clubs, jobs, caring for family, appointments, or anything else that happens at a set time — weekly or just once.</p>' : ''}`;
}

function legendHTML() {
  return `<ul class="legend" aria-label="Calendar key">
    <li><span class="key key-sleep"></span>Protected sleep</li>
    <li><span class="key key-winddown"></span>Wind-down</li>
    <li><span class="key key-fixed"></span>School &amp; commitments</li>
    <li><span class="key key-study"></span>Study session</li>
    <li><span class="key key-pinned"></span>Placed by you</li>
  </ul>`;
}

function segments(block, days) {
  const out = [];
  for (let d = Math.max(0, Math.floor(block.start / DAY)); d < days && d * DAY < block.end; d++) {
    const s = Math.max(block.start, d * DAY);
    const e = Math.min(block.end, (d + 1) * DAY);
    if (e > s) out.push({ day: d, s: s - d * DAY, e: e - d * DAY, first: s === block.start, last: e === block.end });
  }
  return out;
}

const TYPE_LABEL = { sleep: 'Sleep', winddown: 'Wind-down', morning: 'Getting ready', school: 'School', travel: 'Travel', commitment: '', study: '' };

function weekHTML(sched, c) {
  const days = sched.days;
  const px = HOUR_PX / 60;
  const cols = [];
  for (let d = 0; d < days; d++) {
    cols.push(`<div class="day-col" role="list" aria-label="${esc(dateLabel(c.startDate, d))}">`);
    for (const b of sched.blocks) {
      for (const seg of segments(b, days)) {
        if (seg.day !== d) continue;
        const top = seg.s * px;
        const h = Math.max(14, (seg.e - seg.s) * px - 2);
        const time = `${fmtTime(b.start)}–${fmtTime(b.end)}`;
        const moved = b.type === 'study' && state.lastMove && state.lastMove.taskId === b.taskId && b.start === state.lastMove.to;
        const style = `top:${top}px;height:${h}px`;
        if (b.type === 'study') {
          cols.push(`<button type="button" role="listitem" class="blk blk-study ${b.pinned ? 'is-pinned' : ''} ${moved ? 'is-moved' : ''}" style="${style}" data-session="${b.id}" aria-label="${esc(b.title)}, ${esc(label(c.startDate, b.start, true))} to ${fmtTime(b.end)}${b.pinned ? ', placed by you' : ''}. Open to move or edit."><span class="blk-t">${esc(b.title)}</span><span class="blk-time">${time}</span></button>`);
        } else if (b.type === 'commitment') {
          cols.push(`<button type="button" role="listitem" class="blk blk-fixed" style="${style}" data-edit-com="${b.commitmentId}" aria-label="${esc(b.title)}, ${time}. Edit commitment."><span class="blk-t">${esc(b.title)}</span><span class="blk-time">${time}</span></button>`);
        } else {
          cols.push(`<div role="listitem" class="blk blk-${b.type === 'school' || b.type === 'travel' ? 'fixed' : b.type}" style="${style}"><span class="blk-t">${esc(TYPE_LABEL[b.type])}</span>${h > 30 ? `<span class="blk-time">${time}</span>` : ''}</div>`);
        }
      }
    }
    if (d === 0) cols.push(`<div class="now-line" style="top:${sched.nowMin * px}px" aria-hidden="true"><span>${c.demo ? 'Now (sample)' : 'Now'}</span></div>`);
    if (state.lastMove && Math.floor(state.lastMove.from / DAY) === d && Date.now() - state.lastMove.at < 20000) {
      const lm = state.lastMove;
      cols.push(`<div class="ghost ${reducedMotion() ? '' : 'fade'}" style="top:${(lm.from - d * DAY) * px}px;height:${(lm.fromEnd - lm.from) * px - 2}px" aria-hidden="true"><span>was here</span></div>`);
    }
    cols.push('</div>');
  }
  const hours = Array.from({ length: 24 }, (_, h) => `<div class="hour" style="top:${h * HOUR_PX}px">${String(h).padStart(2, '0')}:00</div>`).join('');
  const heads = Array.from({ length: days }, (_, d) => `<div class="day-head ${d === 0 ? 'is-today' : ''}"><span>${esc(dateLabel(c.startDate, d, { weekday: 'short' }))}</span> <span class="day-num">${esc(dateLabel(c.startDate, d, { day: 'numeric' }))}</span></div>`).join('');
  return `
  <div class="week" aria-describedby="week-help">
    <p id="week-help" class="hint">Select a study session to move it, edit it or mark it done — or drag it with a mouse to an open time. Prefer a list? Use the Agenda view.</p>
    <div class="week-heads"><div class="hour-gutter"></div>${heads}</div>
    <div class="week-scroll" tabindex="0" aria-label="Weekly calendar, scrollable">
      <div class="week-grid" style="height:${24 * HOUR_PX}px"><div class="hour-gutter">${hours}</div>${cols.join('')}</div>
    </div>
  </div>`;
}

function agendaHTML(sched, c) {
  const out = [];
  for (let d = 0; d < sched.days; d++) {
    const items = sched.blocks.filter((b) => b.start < (d + 1) * DAY && b.end > d * DAY && b.type !== 'morning' && !(b.type === 'sleep' && b.start < d * DAY) && !(b.type === 'winddown' && b.start < d * DAY));
    out.push(`<section class="agenda-day" aria-labelledby="ag-${d}"><h3 id="ag-${d}">${esc(dateLabel(c.startDate, d))}${d === 0 ? ' · today' : ''}</h3><ol class="agenda-list">`);
    let nowShown = d !== 0;
    const nowItem = () => `<li class="ag ag-now"><span class="ag-time">${fmtTime(sched.nowMin)}</span><span class="ag-text">${c.demo ? 'Now (sample)' : 'Now'} — study is only placed after this</span></li>`;
    for (const b of items) {
      if (!nowShown && b.start >= sched.nowMin) { out.push(nowItem()); nowShown = true; }
      const time = `${fmtTime(b.start)}–${fmtTime(b.end)}${b.end > (d + 1) * DAY ? ' (next day)' : ''}`;
      const moved = b.type === 'study' && state.lastMove && state.lastMove.taskId === b.taskId && b.start === state.lastMove.to;
      if (b.type === 'study') {
        out.push(`<li class="ag ag-study ${b.pinned ? 'is-pinned' : ''} ${moved ? 'is-moved' : ''}"><span class="ag-time">${time}</span><button type="button" class="ag-btn" data-session="${b.id}"><span class="ag-kind">Study</span> ${esc(b.title)}${b.pinned ? ' <span class="tag">placed by you</span>' : ''}${moved ? ` <span class="tag tag-lav">moved from ${esc(label(c.startDate, state.lastMove.from))}</span>` : ''}</button></li>`);
      } else if (b.type === 'commitment') {
        out.push(`<li class="ag ag-fixed"><span class="ag-time">${time}</span><button type="button" class="ag-btn" data-edit-com="${b.commitmentId}"><span class="ag-kind">Commitment</span> ${esc(b.title)}</button></li>`);
      } else {
        const kind = { sleep: 'Protected sleep', winddown: 'Wind-down', school: 'School', travel: 'Travel' }[b.type] || b.title;
        out.push(`<li class="ag ag-${b.type}"><span class="ag-time">${time}</span><span class="ag-text"><span class="ag-kind">${esc(kind)}</span>${b.type === 'travel' ? ` ${esc(b.title)}` : ''}</span></li>`);
      }
    }
    if (!nowShown) out.push(nowItem());
    out.push('</ol></section>');
  }
  return `<div class="agenda">${out.join('')}</div>`;
}

// ------------------------------------------------------------ export
function exportICS(sched, c, includeWind) {
  const pad = (n) => String(n).padStart(2, '0');
  const [y, m, d] = c.startDate.split('-').map(Number);
  const toUTC = (abs) => {
    const dt = new Date(y, m - 1, d, 0, 0, 0);
    dt.setMinutes(dt.getMinutes() + abs);
    return `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}T${pad(dt.getUTCHours())}${pad(dt.getUTCMinutes())}00Z`;
  };
  const escText = (s) => String(s).replace(/\\/g, '\\\\').replace(/[,;]/g, (x) => `\\${x}`).replace(/\n/g, '\\n');
  const stamp = toUTC(sched.nowMin);
  const events = sched.study.map((b) => [
    'BEGIN:VEVENT', `UID:${b.id}@rewrite-tomorrow`, `DTSTAMP:${stamp}`, `DTSTART:${toUTC(b.start)}`, `DTEND:${toUTC(b.end)}`,
    `SUMMARY:${escText(`Study: ${b.title}`)}`, 'END:VEVENT',
  ].join('\r\n'));
  if (includeWind) {
    for (const w of sched.reserved.filter((b) => b.type === 'winddown' && b.start >= sched.nowMin && b.start < sched.days * DAY)) {
      events.push(['BEGIN:VEVENT', `UID:${w.id}-${c.startDate}@rewrite-tomorrow`, `DTSTAMP:${stamp}`, `DTSTART:${toUTC(w.start)}`, `DTEND:${toUTC(w.end)}`, 'SUMMARY:Wind-down', 'END:VEVENT'].join('\r\n'));
    }
  }
  if (!events.length) { toast('There are no scheduled study sessions to export yet.'); return; }
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Rewrite Tomorrow//Study plan//EN', 'CALSCALE:GREGORIAN', ...events, 'END:VCALENDAR', ''].join('\r\n');
  download(isDemo() ? 'rewrite-tomorrow-sample.ics' : 'rewrite-tomorrow-plan.ics', ics, 'text/calendar');
  if (!inFrame) toast(`Exported ${events.length} calendar item${events.length > 1 ? 's' : ''}.`);
}
