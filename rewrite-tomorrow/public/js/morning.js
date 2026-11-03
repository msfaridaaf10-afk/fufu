// Optional morning check-in. Every question can be skipped. Observations are
// descriptive only and appear only once there is enough data to describe.
import { esc, $, $$, toast, confirmDialog } from './ui.js';
import { state, addMorning, deleteMorning, isDemo } from './store.js';

const SLEEP = [['<5', 'Less than 5 h', 4.5], ['5-6', '5–6 h', 5.5], ['6-7', '6–7 h', 6.5], ['7-8', '7–8 h', 7.5], ['8-9', '8–9 h', 8.5], ['9-10', '9–10 h', 9.5], ['10+', 'More than 10 h', 10.5]];
const RESTED = [[1, 'Not at all'], [2, 'A little'], [3, 'Okay'], [4, 'Fairly'], [5, 'Very']];
const FOCUS = [[1, 'Very hard'], [2, 'Hard'], [3, 'Okay'], [4, 'Fairly easy'], [5, 'Easy']];
const ADJUST = ['Start winding down earlier', 'Phone out of reach tonight', 'Move a study session earlier', 'Keep things as they are'];
const MIN_ENTRIES = 5;
const MIN_GROUP = 3;

export function renderMorning(el) {
  const draw = (justSaved = false) => {
    const entries = state.personal.morning;
    el.innerHTML = `
    <div class="single-column morning">
      <p class="kicker evidence-label">Morning check-in · optional</p>
      <h1>What did you notice this morning?</h1>
      <p class="lede">Four quick questions. Skip any of them. This is about small adjustments, not grading last night.</p>
      ${isDemo() ? '<p class="info-note">You’re in the sample day. Morning entries are only kept for your own plan — leave the sample day to save one.</p>' : ''}
      ${justSaved ? `<div class="paper-card result-card" role="status"><p><strong>Noted.</strong> ${state.prefs.save ? 'Saved on this device.' : 'Kept until you close this page — turn on saving in Settings to keep entries.'} Have a good day.</p></div>` : ''}
      <form id="mc-form" class="stack mc-form">
        <fieldset class="field-group"><legend>Roughly how long did you sleep?</legend>
          <div class="chip-grid compact">${SLEEP.map(([v, t]) => `<label class="chip-check"><input type="radio" name="sleep" value="${v}"><span>${t}</span></label>`).join('')}</div>
          <p class="hint">A rough guess is fine — this is your own estimate, not a measurement.</p>
        </fieldset>
        <fieldset class="field-group"><legend>How rested do you feel?</legend>
          <div class="chip-grid compact">${RESTED.map(([v, t]) => `<label class="chip-check"><input type="radio" name="rested" value="${v}"><span>${t}</span></label>`).join('')}</div>
        </fieldset>
        <fieldset class="field-group"><legend>How easy is it to focus?</legend>
          <div class="chip-grid compact">${FOCUS.map(([v, t]) => `<label class="chip-check"><input type="radio" name="focus" value="${v}"><span>${t}</span></label>`).join('')}</div>
        </fieldset>
        <fieldset class="field-group"><legend>Anything you want to adjust?</legend>
          <div class="chip-grid compact">${ADJUST.map((t) => `<label class="chip-check"><input type="checkbox" name="adjust" value="${esc(t)}"><span>${esc(t)}</span></label>`).join('')}</div>
          <label class="field"><span class="field-label">Or in your own words (optional)</span><input name="note" maxlength="120"></label>
        </fieldset>
        <div class="btn-row">
          <button class="btn btn-primary" type="submit" ${isDemo() ? 'disabled' : ''}>Save this morning</button>
          <a class="btn btn-quiet" href="#home">Skip for today</a>
        </div>
      </form>
      ${observationsHTML(entries)}
      ${entries.length ? historyHTML(entries) : ''}
    </div>`;

    $('#mc-form', el).addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      const get = (n) => (f.querySelector(`[name="${n}"]:checked`) || {}).value;
      const entry = {
        date: new Date().toISOString().slice(0, 10),
        sleep: get('sleep') || null,
        rested: get('rested') ? Number(get('rested')) : null,
        focus: get('focus') ? Number(get('focus')) : null,
        adjust: $$('[name="adjust"]:checked', f).map((i) => i.value),
        note: f.elements.note.value.trim().slice(0, 120),
      };
      if (!entry.sleep && !entry.rested && !entry.focus && !entry.adjust.length && !entry.note) {
        toast('Nothing to save — that’s fine. Skipping is always okay.');
        return;
      }
      addMorning(entry);
      draw(true);
      $('.result-card', el)?.focus?.();
    });
    $$('[data-del-entry]', el).forEach((b) => b.addEventListener('click', async () => {
      const ok = await confirmDialog({ title: 'Delete this entry?', message: 'It will be removed from this device.', confirm: 'Delete', danger: true });
      if (ok) { deleteMorning(Number(b.dataset.delEntry)); draw(); }
    }));
  };
  draw();
}

function avg(xs) { return xs.reduce((a, b) => a + b, 0) / xs.length; }

function observationsHTML(entries) {
  const withSleep = entries.filter((e) => e.sleep);
  if (entries.length < MIN_ENTRIES) {
    return `<section class="paper-sheet obs" aria-labelledby="obs-h"><h2 id="obs-h">Your observations</h2>
      <p>After ${MIN_ENTRIES} mornings, you’ll see a simple description of your own notes here. ${entries.length ? `You have ${entries.length} so far.` : ''}</p>
      <p class="hint">These are your own observations. They cannot tell us what caused a change.</p></section>`;
  }
  const hours = (e) => (SLEEP.find(([v]) => v === e.sleep) || [])[2];
  const lines = [];
  if (withSleep.length >= MIN_ENTRIES) {
    const h = withSleep.map(hours);
    lines.push(`You estimated your sleep on ${withSleep.length} mornings, from about ${Math.min(...h) - 0.5} to ${Math.max(...h) + 0.5} hours.`);
  }
  const longer = entries.filter((e) => e.sleep && hours(e) >= 8 && e.focus);
  const shorter = entries.filter((e) => e.sleep && hours(e) < 8 && e.focus);
  if (longer.length >= MIN_GROUP && shorter.length >= MIN_GROUP) {
    lines.push(`On mornings after an estimated 8+ hours (${longer.length}), you rated focus ${avg(longer.map((e) => e.focus)).toFixed(1)} out of 5 on average. After less than 8 hours (${shorter.length}), it was ${avg(shorter.map((e) => e.focus)).toFixed(1)}.`);
  } else {
    lines.push('There aren’t enough entries in each group yet to compare focus after longer and shorter nights.');
  }
  const rested = entries.filter((e) => e.rested);
  if (rested.length >= MIN_ENTRIES) lines.push(`Your average “rested” rating is ${avg(rested.map((e) => e.rested)).toFixed(1)} out of 5.`);
  const adj = {};
  entries.forEach((e) => (e.adjust || []).forEach((a) => { adj[a] = (adj[a] || 0) + 1; }));
  const top = Object.entries(adj).sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 2) lines.push(`The adjustment you chose most often: “${top[0]}” (${top[1]} times).`);

  const dots = entries.slice(-14).map((e) => {
    const hh = e.sleep ? hours(e) : null;
    return `<li><span class="dot-bar" style="--h:${hh ? Math.round((hh / 11) * 100) : 0}%" aria-hidden="true"></span><span class="visually-hidden">${esc(e.date)}: ${e.sleep ? `${esc((SLEEP.find(([v]) => v === e.sleep) || [])[1])}` : 'sleep skipped'}${e.focus ? `, focus ${e.focus} of 5` : ''}</span></li>`;
  }).join('');
  return `<section class="paper-sheet obs" aria-labelledby="obs-h"><h2 id="obs-h">Your observations</h2>
    <ul class="dot-chart" aria-label="Estimated sleep, most recent ${Math.min(14, entries.length)} entries">${dots}</ul>
    <ul class="obs-list">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
    <p class="obs-caveat"><strong>These are your own observations. They cannot tell us what caused a change.</strong> They’re self-reported estimates, not measurements.</p>
    <p class="hint">If you’ve noticed tiredness making daytime hard for a while, it’s worth talking to a parent or carer, your school nurse or a doctor.</p></section>`;
}

function historyHTML(entries) {
  return `<details class="paper-sheet history"><summary>Your entries (${entries.length})</summary>
    <ul class="entry-list">${entries.map((e, i) => `<li><span>${esc(e.date)} · ${e.sleep ? esc((SLEEP.find(([v]) => v === e.sleep) || [])[1]) : '—'} · rested ${e.rested ?? '—'} · focus ${e.focus ?? '—'}${e.note ? ` · “${esc(e.note)}”` : ''}</span>
    <button class="btn btn-quiet btn-small" type="button" data-del-entry="${i}">Delete</button></li>`).join('')}</ul></details>`;
}
