// Signature feature: "Rewrite this evening".
// Two panels — the current plan and a possible rewrite — built only from honest
// calculations. Nothing changes until the student approves; Undo is always offered.
import { esc, $, $$, toast, openDialog, fieldError } from './ui.js';
import { state, getPlan, updatePlan, clock, undo, decide, canWait, enterDemo, isDemo, schedule } from './store.js';
import { proposeRewrite, tonightWindow, fmtTime, fmtDuration, label, absMinute, addDays, makeId, validateTask, DAY } from './scheduler.js';

const CHOICE_LABEL = { tonight: 'Needs tonight', move: 'Can move', help: 'Ask for help or time' };

export function renderRewrite(el) {
  const ui = { selected: null, choices: {}, applied: false };

  const draw = () => {
    const plan = getPlan();
    const c = clock();
    const open = plan.tasks.filter((t) => !t.done);
    if (!open.length) return drawEmpty(c);

    const sched = schedule(plan);
    const tw = tonightWindow(plan, sched);
    if (ui.selected === null) {
      ui.selected = open.filter((t) => t.tonight || absMinute(c.startDate, t.dueDate, t.dueTime) <= DAY + 12 * 60).map((t) => t.id);
    }
    ui.selected = ui.selected.filter((id) => open.some((t) => t.id === id));
    for (const t of open) {
      if (!ui.choices[t.id]) {
        const dueSoon = absMinute(c.startDate, t.dueDate, t.dueTime) <= tw.protectStart + 16 * 60;
        ui.choices[t.id] = tw.isNight ? 'move' : t.flexible === false || (dueSoon && t.priority === 'high') ? 'tonight' : 'move';
      }
    }

    const r = proposeRewrite(plan, { startDate: c.startDate, nowMin: c.nowMin, days: 7 }, ui.selected, ui.choices);
    const tonightConflicts = sched.conflicts.filter((x) => x.start < tw.protectStart + 60 && x.end > tw.now);
    const selTasks = open.filter((t) => ui.selected.includes(t.id));

    el.innerHTML = `
    <div class="rewrite">
      <div class="page-head">
        <p class="kicker evidence-label">Rewrite this evening</p>
        <h1>Let’s see what actually fits.</h1>
        <p class="lede">${tw.isNight
          ? `It’s already past the start of your wind-down (${fmtTime(tw.protectStart)}). Anything left can move to tomorrow.`
          : `You have until ${fmtTime(tw.protectStart)} before your wind-down. Here’s an honest look at tonight.`}</p>
      </div>

      <section class="paper-sheet pick" aria-labelledby="pick-h">
        <h2 id="pick-h">What were you planning to do tonight?</h2>
        <ul class="pick-list" role="list">
          ${open.map((t) => `
          <li class="pick-row">
            <label class="check-inline"><input type="checkbox" data-sel="${t.id}" ${ui.selected.includes(t.id) ? 'checked' : ''}>
              <span><strong>${esc(t.title)}</strong> <span class="task-meta">${fmtDuration(t.minutes)} · due ${esc(label(c.startDate, absMinute(c.startDate, t.dueDate, t.dueTime)))}</span></span></label>
            ${ui.selected.includes(t.id) ? `
            <div class="seg seg-wrap" role="radiogroup" aria-label="What should happen with ${esc(t.title)}?">
              ${Object.entries(CHOICE_LABEL).map(([v, n]) => `<label class="seg-radio"><input type="radio" name="ch-${t.id}" value="${v}" data-choice="${t.id}" ${ui.choices[t.id] === v ? 'checked' : ''}><span>${n}</span></label>`).join('')}
            </div>` : ''}
          </li>`).join('')}
        </ul>
        <button class="btn btn-quiet btn-small" type="button" id="rw-add">Add something else for tonight</button>
      </section>

      <div class="panels">
        <section class="panel panel-current paper-sheet" aria-labelledby="cur-h">
          <p class="panel-tag evidence-label">Panel 1</p>
          <h2 id="cur-h">My current plan</h2>
          ${selTasks.length ? `
          <dl class="facts">
            <div><dt>Work planned for tonight</dt><dd>${fmtDuration(r.demand)}</dd></div>
            <div><dt>Usable study time before wind-down</dt><dd>${fmtDuration(tw.available)}</dd></div>
            <div><dt>Protected sleep opportunity</dt><dd>${tw.sleepStart != null ? `${fmtTime(tw.sleepStart)} → ${fmtTime(tw.sleepEnd)}` : '—'} (${fmtDuration(plan.settings.sleepHours * 60)})</dd></div>
          </dl>
          ${r.overBy > 0
            ? `<p class="panel-msg">Working straight through with short breaks, you’d finish around <strong>${fmtTime(r.finishIfAll)}</strong>${r.finishIfAll >= DAY ? ' (after midnight)' : ''}. That’s ${fmtDuration(r.overBy)} into your wind-down and sleep time.</p>`
            : `<p class="panel-msg">This fits before your wind-down. You could stop here.</p>`}
          ${tonightConflicts.length ? `<p class="panel-msg">Tonight also has ${tonightConflicts.length} overlapping commitment${tonightConflicts.length > 1 ? 's' : ''}, shown in the planner.</p>` : ''}
          <ul class="plain-list">${selTasks.map((t) => `<li>${esc(t.title)} · ${fmtDuration(t.minutes)}</li>`).join('')}</ul>`
          : '<p>Tick what you were planning to do tonight, and the two panels will compare it with the time you have.</p>'}
        </section>

        <div class="panel-thread" aria-hidden="true"><svg viewBox="0 0 40 120" preserveAspectRatio="none"><path d="M20 0 C 0 40, 40 80, 20 120" fill="none" stroke="var(--thread)" stroke-width="1.5"/></svg></div>

        <section class="panel panel-rewrite paper-sheet" aria-labelledby="rw-h" aria-live="polite">
          <p class="panel-tag evidence-label">Panel 2</p>
          <h2 id="rw-h">A possible rewrite</h2>
          ${selTasks.length ? rewriteBody(r, c) : '<p>Your rewrite will appear here.</p>'}
          ${selTasks.length ? `
          <div class="btn-row">
            <button class="btn btn-primary" type="button" id="rw-apply">Use this rewrite</button>
            <button class="btn btn-secondary" type="button" id="rw-keep">Keep my current plan</button>
          </div>
          <p class="hint">Nothing changes until you choose “Use this rewrite”. You can undo it afterwards.</p>` : ''}
        </section>
      </div>
      <p class="method-note hint">How this is worked out: protected sleep, wind-down and commitments are reserved first; study only goes into the time left, in sessions of ${plan.settings.sessionLen} minutes with ${plan.settings.breakLen}-minute breaks. These numbers describe your schedule — they can’t predict grades, mood or how well you’ll sleep.</p>
    </div>`;

    $$('[data-sel]', el).forEach((cb) => cb.addEventListener('change', () => {
      const id = cb.dataset.sel;
      ui.selected = cb.checked ? [...ui.selected, id] : ui.selected.filter((x) => x !== id);
      draw();
      const again = $(`[data-sel="${id}"]`, el);
      if (again) again.focus();
    }));
    $$('[data-choice]', el).forEach((rb) => rb.addEventListener('change', () => {
      ui.choices[rb.dataset.choice] = rb.value;
      const name = rb.name;
      const val = rb.value;
      draw();
      const again = $(`[name="${name}"][value="${val}"]`, el);
      if (again) again.focus();
    }));
    $('#rw-add', el).addEventListener('click', () => quickAdd(c));
    const apply = $('#rw-apply', el);
    if (apply) apply.addEventListener('click', () => applyRewrite(r, c));
    const keep = $('#rw-keep', el);
    if (keep) keep.addEventListener('click', () => {
      toast('Okay — your plan stays as it is. You can come back to this any time.');
      ui.selected = [];
      draw();
    });
  };

  function rewriteBody(r, c) {
    const lines = [];
    for (const ch of r.changes) {
      if (ch.kind === 'keep') {
        lines.push(`<li class="chg chg-keep"><span class="chg-kind">Tonight</span><p><strong>${esc(ch.title)}</strong> · ${fmtDuration(ch.minutes)}${ch.nowLabel ? ` · from ${esc(ch.nowLabel)}` : ''}</p><p class="chg-why">${esc(ch.reason)}</p></li>`);
      } else if (ch.kind === 'split') {
        lines.push(`<li class="chg chg-keep"><span class="chg-kind">Tonight</span><p><strong>${esc(ch.title)} — essential part</strong> · ${fmtDuration(ch.tonightMinutes)}${ch.nowLabel ? ` · from ${esc(ch.nowLabel)}` : ''}</p></li>`);
        lines.push(`<li class="chg chg-move"><span class="chg-kind">Moves</span><p><strong>${esc(ch.title)} — the rest</strong> · ${fmtDuration(ch.restMinutes)} → ${ch.newLabel ? esc(ch.newLabel) : '<em>no open time before it’s due</em>'}</p><p class="chg-why">${esc(ch.reason)}</p>${ch.stillUnscheduled ? `<p class="chg-attn">${fmtDuration(ch.stillUnscheduled)} still doesn’t fit before the deadline. Asking for help or more time could be worth it.</p>` : ''}</li>`);
      } else if (ch.kind === 'help') {
        lines.push(`<li class="chg chg-help"><span class="chg-kind">Ask</span><p><strong>Prepare a question for the teacher about “${esc(ch.title)}”</strong> · 10 min${ch.askLabel ? ` → ${esc(ch.askLabel)}` : ''}</p><p class="chg-why">${esc(ch.reason)}</p></li>`);
        lines.push(`<li class="chg chg-move"><span class="chg-kind">Moves</span><p><strong>${esc(ch.title)}</strong>${ch.wasLabel ? ` · was ${esc(ch.wasLabel)}` : ''} → ${ch.newLabel ? esc(ch.newLabel) : '<em>no open time before it’s due</em>'}</p>${ch.stillUnscheduled ? `<p class="chg-attn">${fmtDuration(ch.stillUnscheduled)} doesn’t fit before the deadline — that’s exactly what to raise with the teacher.</p>` : ''}</li>`);
      } else {
        lines.push(`<li class="chg chg-move"><span class="chg-kind">Moves</span><p><strong>${esc(ch.title)}</strong>${ch.wasLabel ? ` · was ${esc(ch.wasLabel)}` : ' · was tonight'} → ${ch.newLabel ? esc(ch.newLabel) : '<em>no open time before it’s due</em>'}</p><p class="chg-why">${esc(ch.reason)}</p>${ch.stillUnscheduled ? `<p class="chg-attn">${fmtDuration(ch.stillUnscheduled)} doesn’t fit before it’s due. Try “Ask for help or time”, or mark it “Needs tonight” to do part of it.</p>` : ''}</li>`);
      }
    }
    const remaining = r.proposed.stats.remainingMin;
    return `
      <dl class="facts">
        <div><dt>Study tonight</dt><dd>${fmtDuration(r.tonightProposedMin)} of ${fmtDuration(r.tonight.available)} available</dd></div>
        <div><dt>Protected sleep opportunity</dt><dd>Unchanged${r.tonight.sleepStart != null ? ` · ${fmtTime(r.tonight.sleepStart)} → ${fmtTime(r.tonight.sleepEnd)}` : ''}</dd></div>
        <div><dt>Work still needing time this week</dt><dd>${remaining ? fmtDuration(remaining) : 'None'}</dd></div>
      </dl>
      <p class="hint">Breaks between sessions, and gaps shorter than 20 minutes, aren’t counted as study time.</p>
      <ol class="chg-list">${lines.join('')}</ol>`;
  }

  function applyRewrite(r, c) {
    const proposed = r.proposedPlan;
    updatePlan((p) => { p.tasks = structuredClone(proposed.tasks); }, 'Rewrite this evening');
    for (const ch of r.changes) {
      if (ch.kind === 'keep') decide(`Tonight: ${ch.title} (${fmtDuration(ch.minutes)}).`);
      if (ch.kind === 'split') { decide(`Tonight: the essential part of ${ch.title} (${fmtDuration(ch.tonightMinutes)}).`); canWait(`The rest of ${ch.title}${ch.newLabel ? ` — ${ch.newLabel}` : ''}.`); }
      if (ch.kind === 'move' || ch.kind === 'no-room') canWait(`${ch.title}${ch.newLabel ? ` — ${ch.newLabel}` : ''}.`);
      if (ch.kind === 'help') { decide(`Prepare a question for the teacher about ${ch.title}.`); canWait(`${ch.title}, until I’ve asked.`); }
    }
    ui.selected = null;
    ui.choices = {};
    toast('Your evening has been rewritten. Your sleep time is unchanged.', { action: { label: 'Undo', fn: () => { undo(); draw(); } }, timeout: 10000 });
    el.innerHTML = `
      <div class="single-column">
        <section class="paper-sheet stop-panel" aria-labelledby="done-h">
          <div class="quiet-check" aria-hidden="true"><svg viewBox="0 0 48 48" width="48" height="48"><circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15 25l6 6 12-14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
          <h1 id="done-h" tabindex="-1">Tonight is rewritten.</h1>
          <p>${r.changes.filter((x) => x.kind !== 'keep').length} change${r.changes.filter((x) => x.kind !== 'keep').length === 1 ? '' : 's'} applied. Your protected sleep time hasn’t moved.</p>
          <div class="btn-row">
            <a class="btn btn-primary" href="#/close">Close the day</a>
            <a class="btn btn-secondary" href="#/plan">See the full week</a>
            <button class="btn btn-quiet" type="button" id="rw-undo">Undo</button>
          </div>
        </section>
      </div>`;
    $('#done-h', el).focus();
    $('#rw-undo', el).addEventListener('click', () => { undo(); toast('Undone. Your previous plan is back.'); draw(); });
  }

  function drawEmpty(c) {
    el.innerHTML = `
    <div class="single-column">
      <p class="kicker evidence-label">Rewrite this evening</p>
      <h1>Let’s see what actually fits.</h1>
      <p class="lede">Add what you were planning to do tonight — a rough guess of the time is fine.</p>
      <div class="btn-row">
        <button class="btn btn-primary" type="button" id="rw-add0">Add tonight’s work</button>
        <a class="btn btn-secondary" href="#/plan">Set up my week first</a>
        ${isDemo() ? '' : '<button class="btn btn-quiet" type="button" id="rw-demo">Explore a sample day</button>'}
      </div>
    </div>`;
    $('#rw-add0', el).addEventListener('click', () => quickAdd(c));
    const demo = $('#rw-demo', el);
    if (demo) demo.addEventListener('click', () => { enterDemo(); ui.selected = null; ui.choices = {}; draw(); toast('Sample day loaded: a fictional student’s Monday at 17:30.'); });
  }

  function quickAdd(c) {
    openDialog({
      title: 'Add something for tonight',
      build(b, close) {
        b.innerHTML = `
        <form class="stack" novalidate>
          <label class="field"><span class="field-label">What is it?</span><input name="title" maxlength="80" placeholder="e.g. Biology revision"><span class="field-error" id="qa-t" data-error-for="title" hidden></span></label>
          <label class="field"><span class="field-label">Roughly how long? (minutes)</span><input name="minutes" type="number" min="5" max="600" step="5" value="60"><span class="field-error" id="qa-m" data-error-for="minutes" hidden></span></label>
          <div class="row-fields">
            <label class="field"><span class="field-label">Due date</span><input name="dueDate" type="date" value="${addDays(c.startDate, 1)}"></label>
            <label class="field"><span class="field-label">Due time</span><input name="dueTime" type="time" value="08:00"></label>
          </div>
          <label class="check-inline"><input type="checkbox" name="flexible" checked> This could move to another day</label>
          <div class="btn-row"><button class="btn btn-primary" type="submit">Add</button><button class="btn btn-secondary" type="button" data-cancel>Cancel</button></div>
        </form>`;
        const f = $('form', b);
        $('[data-cancel]', b).addEventListener('click', () => close());
        f.addEventListener('submit', (e) => {
          e.preventDefault();
          const t = { id: makeId('t'), title: f.elements.title.value.trim(), minutes: Number(f.elements.minutes.value), dueDate: f.elements.dueDate.value, dueTime: f.elements.dueTime.value, priority: 'medium', flexible: f.elements.flexible.checked, tonight: true, pins: [] };
          const errs = validateTask(t);
          ['title', 'minutes'].forEach((n) => fieldError(f, n, (errs.find((x) => x.field === n) || {}).msg));
          if (errs.length) return;
          updatePlan((p) => { p.tasks.push(t); }, `Add “${t.title}”`);
          if (ui.selected) ui.selected.push(t.id);
          close();
          draw();
        });
      },
    });
  }

  draw();
}
