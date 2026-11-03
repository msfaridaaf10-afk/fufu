// "Close the day" — gathers tonight's choices, offers optional breathing, a
// printable wind-down card, and a clear, quiet stopping point.
import { esc, $, $$, toast, download, reducedMotion } from './ui.js';
import { state } from './store.js';

const DEFAULT_STEPS = [
  'Put tomorrow’s things by the door',
  'Screens away, lights low',
  'Something quiet: paper book, stretching or music',
  'If my mind is busy, write it down and leave it',
];

export function renderClose(el) {
  let timer = null;
  const steps = [...DEFAULT_STEPS];

  const draw = () => {
    const s = state.session;
    const decided = s.decided;
    const waits = s.canWait;
    el.innerHTML = `
    <div class="close-day">
      <div class="page-head narrow">
        <p class="kicker evidence-label">Close the day</p>
        <h1>Here is what you decided.</h1>
      </div>

      <section class="day-card paper-card torn-bottom" aria-labelledby="dc-h">
        <h2 id="dc-h" class="visually-hidden">Tonight’s card</h2>
        <div class="day-card-col">
          <h3>Decided</h3>
          ${decided.length ? `<ul class="day-list">${decided.map((d, i) => `<li><span>${esc(d)}</span><button class="icon-btn" type="button" data-rm-d="${i}" aria-label="Remove: ${esc(d)}">×</button></li>`).join('')}</ul>` : '<p class="muted">Nothing yet — and that’s fine. Not deciding anything tonight is a decision too.</p>'}
          <form class="inline-add" id="add-d"><label class="visually-hidden" for="add-d-in">Add something you decided</label><input id="add-d-in" maxlength="100" placeholder="Add something you decided"><button class="btn btn-quiet btn-small" type="submit">Add</button></form>
        </div>
        <div class="day-card-col">
          <h3>Here is what can wait.</h3>
          ${waits.length ? `<ul class="day-list">${waits.map((d, i) => `<li><span>${esc(d)}</span><button class="icon-btn" type="button" data-rm-w="${i}" aria-label="Remove: ${esc(d)}">×</button></li>`).join('')}</ul>` : '<p class="muted">Anything that isn’t needed before tomorrow morning.</p>'}
          <form class="inline-add" id="add-w"><label class="visually-hidden" for="add-w-in">Add something that can wait</label><input id="add-w-in" maxlength="100" placeholder="Add something that can wait"><button class="btn btn-quiet btn-small" type="submit">Add</button></form>
        </div>
        <p class="day-card-foot">You can stop here.</p>
      </section>
      <p class="hint center">This card exists only on this page tonight. It isn’t saved or sent anywhere.</p>

      <section class="paper-sheet breathe" aria-labelledby="br-h">
        <h2 id="br-h">Optional: comfortable breathing</h2>
        <p>Breathe in gently through your nose, and out a little more slowly. No holding, no counting perfectly — if it feels uncomfortable, just breathe normally. It won’t make you fall asleep on command, but it can help you slow down.</p>
        <div class="breathe-stage">
          <div class="breathe-circle" id="br-circle" aria-hidden="true"></div>
          <p class="breathe-cue" id="br-cue" aria-live="polite">Ready when you are.</p>
        </div>
        <div class="btn-row center">
          <button class="btn btn-secondary" type="button" data-breathe="1">1 minute</button>
          <button class="btn btn-secondary" type="button" data-breathe="2">2 minutes</button>
          <button class="btn btn-quiet" type="button" id="br-stop" hidden>Stop</button>
        </div>
        <details class="grounding"><summary>Prefer grounding instead?</summary>
          <p>Notice, without rushing: <strong>5</strong> things you can see, <strong>4</strong> you can feel (the blanket, your feet), <strong>3</strong> you can hear, <strong>2</strong> you can smell, <strong>1</strong> slow breath out.</p>
        </details>
      </section>

      <section class="paper-sheet" aria-labelledby="wc-h">
        <h2 id="wc-h">A wind-down card for your bedside</h2>
        <p>Edit the steps, then print it or save it, so you don’t need the screen tomorrow night.</p>
        <ol class="wind-steps" id="wind-steps">
          ${steps.map((st, i) => `<li><label class="visually-hidden" for="ws-${i}">Step ${i + 1}</label><input id="ws-${i}" data-step="${i}" value="${esc(st)}" maxlength="80"></li>`).join('')}
        </ol>
        <div class="btn-row">
          <button class="btn btn-secondary" type="button" id="wc-print">Print card</button>
          <button class="btn btn-secondary" type="button" id="wc-save">Save as a text file</button>
        </div>
      </section>

      <div class="print-card" aria-hidden="true">
        <p class="pc-brand">Rewrite Tomorrow</p>
        <h2>Tonight</h2>
        <ol>${steps.map((st) => `<li>${esc(st)}</li>`).join('')}</ol>
        ${decided.length ? `<h3>Decided</h3><ul>${decided.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}
        ${waits.length ? `<h3>Can wait</h3><ul>${waits.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}
        <p class="pc-foot">You can stop here.</p>
      </div>

      <section class="finish" aria-labelledby="fin-h">
        <button class="btn btn-primary btn-large" type="button" id="finish">I’m finished for tonight</button>
        <div id="finish-msg" hidden>
          <div class="quiet-check" aria-hidden="true"><svg viewBox="0 0 48 48" width="56" height="56"><circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15 25l6 6 12-14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
          <h2 id="fin-h" tabindex="-1">Put your screen down when you’re ready.</h2>
          <p class="muted">Nothing else needs you tonight.</p>
        </div>
      </section>
    </div>`;
    wire();
  };

  function wire() {
    $$('[data-rm-d]', el).forEach((b) => b.addEventListener('click', () => { state.session.decided.splice(Number(b.dataset.rmD), 1); draw(); $('#add-d-in', el).focus(); }));
    $$('[data-rm-w]', el).forEach((b) => b.addEventListener('click', () => { state.session.canWait.splice(Number(b.dataset.rmW), 1); draw(); $('#add-w-in', el).focus(); }));
    $('#add-d', el).addEventListener('submit', (e) => { e.preventDefault(); const v = $('#add-d-in', el).value.trim(); if (v) { state.session.decided.push(v); draw(); $('#add-d-in', el).focus(); } });
    $('#add-w', el).addEventListener('submit', (e) => { e.preventDefault(); const v = $('#add-w-in', el).value.trim(); if (v) { state.session.canWait.push(v); draw(); $('#add-w-in', el).focus(); } });
    $$('[data-step]', el).forEach((i) => i.addEventListener('input', () => {
      steps[Number(i.dataset.step)] = i.value;
      const li = $$('.print-card ol li', el)[Number(i.dataset.step)];
      if (li) li.textContent = i.value;
    }));
    $('#wc-print', el).addEventListener('click', () => window.print());
    $('#wc-save', el).addEventListener('click', () => {
      const s = state.session;
      const text = [
        'REWRITE TOMORROW — wind-down card', '',
        'Tonight:', ...steps.filter(Boolean).map((x, i) => `  ${i + 1}. ${x}`), '',
        ...(s.decided.length ? ['Decided:', ...s.decided.map((x) => `  - ${x}`), ''] : []),
        ...(s.canWait.length ? ['Can wait:', ...s.canWait.map((x) => `  - ${x}`), ''] : []),
        'You can stop here.', '',
      ].join('\n');
      download('wind-down-card.txt', text);
    });
    $$('[data-breathe]', el).forEach((b) => b.addEventListener('click', () => breathe(Number(b.dataset.breathe))));
    $('#br-stop', el).addEventListener('click', stopBreathing);
    $('#finish', el).addEventListener('click', () => {
      stopBreathing();
      $('#finish', el).hidden = true;
      const msg = $('#finish-msg', el);
      msg.hidden = false;
      document.documentElement.classList.add('is-finished');
      $('#fin-h', el).focus();
    });
  }

  function breathe(minutes) {
    stopBreathing();
    const circle = $('#br-circle', el);
    const cue = $('#br-cue', el);
    const stop = $('#br-stop', el);
    stop.hidden = false;
    const still = reducedMotion();
    circle.classList.toggle('is-still', still);
    const IN = 4000;
    const OUT = 6000;
    const end = Date.now() + minutes * 60000;
    let phase = 'in';
    const step = () => {
      if (Date.now() >= end) {
        cue.textContent = 'That’s it. Breathe however feels natural.';
        circle.className = 'breathe-circle';
        stop.hidden = true;
        timer = null;
        return;
      }
      if (phase === 'in') {
        cue.textContent = 'Breathe in gently…';
        circle.className = `breathe-circle is-in${still ? ' is-still' : ''}`;
        phase = 'out';
        timer = setTimeout(step, IN);
      } else {
        cue.textContent = '…and out, slowly.';
        circle.className = `breathe-circle is-out${still ? ' is-still' : ''}`;
        phase = 'in';
        timer = setTimeout(step, OUT);
      }
    };
    step();
  }

  function stopBreathing() {
    if (timer) clearTimeout(timer);
    timer = null;
    const circle = $('#br-circle', el);
    if (circle) circle.className = 'breathe-circle';
    const cue = $('#br-cue', el);
    if (cue) cue.textContent = 'Ready when you are.';
    const stop = $('#br-stop', el);
    if (stop) stop.hidden = true;
  }

  draw();
  return () => { stopBreathing(); document.documentElement.classList.remove('is-finished'); };
}
