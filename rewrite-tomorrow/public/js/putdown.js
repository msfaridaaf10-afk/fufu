// "Put it down for tonight" — optional thought offloading.
// Private writing stays in this view's memory only: never saved, never exported,
// never copied into the plan unless the student explicitly chooses to.
import { esc, $, $$, toast, openDialog, fieldError, reducedMotion } from './ui.js';
import { decide, canWait, updatePlan, clock } from './store.js';
import { addDays, makeId, validateTask } from './scheduler.js';

const PROMPTS = [
  { key: 'mind', q: 'What is on my mind?', hint: 'A few words is plenty. Nobody else will see this.' },
  { key: 'action', q: 'Is there a small action I can take?', hint: 'It’s fine if there isn’t one.' },
  { key: 'when', q: 'When could I return to it?', hint: 'For example “tomorrow after school” or “at the weekend”.' },
];

const CHOICES = [
  { id: 'plan', label: 'Make a small plan', note: 'Turn a small action into a task — only if you want to.' },
  { id: 'later', label: 'Come back to this', note: 'Pick a time to think about it again.' },
  { id: 'talk', label: 'Talk to someone', note: 'Ideas for who and how.' },
  { id: 'leave', label: 'Leave it here for now', note: 'Fold it away. It will still be there tomorrow if you need it.' },
];

export function renderPutDown(el) {
  let notes = { mind: '', action: '', when: '' };
  let step = 0;
  let noWrite = false;

  const draw = () => {
    if (step < PROMPTS.length && !noWrite) drawPrompt();
    else drawCard();
  };

  function drawPrompt() {
    const p = PROMPTS[step];
    el.innerHTML = `
    <div class="single-column">
      <p class="kicker evidence-label">Put it down for tonight · ${step + 1} of 3</p>
      <form id="pd-form" class="pd-form">
        <label for="pd-text"><span class="h1-like">${esc(p.q)}</span></label>
        <p class="hint" id="pd-hint">${esc(p.hint)}</p>
        <div class="paper-card paper-lined">
          <textarea id="pd-text" rows="4" maxlength="600" aria-describedby="pd-hint">${esc(notes[p.key])}</textarea>
        </div>
        <div class="btn-row">
          <button class="btn btn-primary" type="submit">${step === 2 ? 'Put it on a card' : 'Next'}</button>
          <button class="btn btn-secondary" type="button" id="pd-skip">Skip this question</button>
          <button class="btn btn-quiet" type="button" id="pd-nowrite">I don’t want to write</button>
        </div>
      </form>
      <p class="hint privacy-inline">Private: this writing isn’t saved and never leaves this page.</p>
    </div>`;
    const t = $('#pd-text', el);
    if (document.body.dataset.booted) t.focus();
    $('#pd-form', el).addEventListener('submit', (e) => { e.preventDefault(); notes[p.key] = t.value.trim(); step += 1; draw(); });
    $('#pd-skip', el).addEventListener('click', () => { notes[p.key] = ''; step += 1; draw(); });
    $('#pd-nowrite', el).addEventListener('click', () => { noWrite = true; notes = { mind: '', action: '', when: '' }; draw(); });
  }

  function drawCard() {
    const empty = !notes.mind && !notes.action && !notes.when;
    el.innerHTML = `
    <div class="single-column">
      <p class="kicker evidence-label">Put it down for tonight</p>
      <h1>${noWrite ? 'That’s completely fine.' : 'Here it is, on paper.'}</h1>
      <p class="lede">${noWrite ? 'You can still decide what happens to the thought — without writing it.' : 'Choose what happens to this card. Drag it onto a choice, or just press one.'}</p>
      <div class="pd-stage">
        <div class="thought-card paper-card torn-bottom" id="thought" tabindex="0" role="group" aria-label="Your thought card${empty ? ' (blank)' : ''}" aria-describedby="drag-help">
          <span class="tape" aria-hidden="true"></span>
          ${empty ? '<p class="thought-blank">A thought, unwritten.</p>' : `
            ${notes.mind ? `<p class="thought-main">${esc(notes.mind)}</p>` : ''}
            ${notes.action ? `<p class="thought-sub"><span class="evidence-label">Small action</span> ${esc(notes.action)}</p>` : ''}
            ${notes.when ? `<p class="thought-sub"><span class="evidence-label">Return to it</span> ${esc(notes.when)}</p>` : ''}`}
        </div>
        <p id="drag-help" class="visually-hidden">Use the four buttons below to choose what happens to this card.</p>
        <ul class="tray-list" role="list">
          ${CHOICES.map((c) => `<li><button class="tray" type="button" data-choice="${c.id}"><span class="tray-label">${esc(c.label)}</span><span class="tray-note">${esc(c.note)}</span></button></li>`).join('')}
        </ul>
      </div>
      <div id="pd-result" class="pd-result" aria-live="polite"></div>
      <p class="hint privacy-inline">Private: this card isn’t saved. Leaving this page clears it.</p>
    </div>`;
    $$('[data-choice]', el).forEach((b) => b.addEventListener('click', () => choose(b.dataset.choice)));
    enableDrag();
  }

  function enableDrag() {
    const card = $('#thought', el);
    let start = null;
    let over = null;
    card.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      start = { x: e.clientX, y: e.clientY };
      card.setPointerCapture(e.pointerId);
      card.classList.add('is-dragging');
    });
    card.addEventListener('pointermove', (e) => {
      if (!start) return;
      card.style.transform = `translate(${e.clientX - start.x}px, ${e.clientY - start.y}px) rotate(-2deg)`;
      card.style.pointerEvents = 'none';
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      card.style.pointerEvents = '';
      const tray = hit && hit.closest('.tray');
      if (over && over !== tray) over.classList.remove('is-over');
      over = tray;
      if (over) over.classList.add('is-over');
    });
    const end = () => {
      if (!start) return;
      start = null;
      card.classList.remove('is-dragging');
      card.style.transform = '';
      if (over) { over.classList.remove('is-over'); choose(over.dataset.choice); }
      over = null;
    };
    card.addEventListener('pointerup', end);
    card.addEventListener('pointercancel', end);
  }

  function choose(id) {
    const out = $('#pd-result', el);
    const card = $('#thought', el);
    $$('[data-choice]', el).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.choice === id)));
    if (id === 'leave') {
      card.classList.add(reducedMotion() ? 'is-folded-still' : 'is-folded');
      setTimeout(() => {
        notes = { mind: '', action: '', when: '' };
        canWait('The thought I put down tonight.');
        out.innerHTML = `
          <div class="paper-card result-card"><h2 tabindex="-1">Left here for now.</h2>
          <p>The card is folded away and cleared from this page. If it comes back tomorrow, you can deal with it then.</p>
          <div class="btn-row"><a class="btn btn-primary" href="#close">Close the day</a><button class="btn btn-quiet" type="button" data-again>Write another</button></div></div>`;
        $('h2', out).focus();
        $('[data-again]', out).addEventListener('click', reset);
        $('.pd-stage', el).remove();
      }, reducedMotion() ? 0 : 450);
      return;
    }
    if (id === 'talk') {
      out.innerHTML = `
        <div class="paper-card result-card"><h2 tabindex="-1">Talking to someone</h2>
        <p>Who feels easiest to talk to? A parent or carer, an older sibling, a friend, a teacher, the school counsellor or nurse.</p>
        <p>You could start with: <em>“Can I talk to you about something that’s been on my mind?”</em> You don’t have to explain everything at once.</p>
        <p class="hint">If this is about feeling unsafe or someone hurting you, please see <a href="#support">Getting support</a>.</p>
        <div class="btn-row"><button class="btn btn-primary" type="button" data-decide>I’ll talk to someone</button><a class="btn btn-quiet" href="#close">Close the day</a></div></div>`;
      $('h2', out).focus();
      $('[data-decide]', out).addEventListener('click', (e) => { decide('Talk to someone I trust about what’s on my mind.'); e.target.disabled = true; e.target.textContent = 'Added to tonight’s card'; });
      return;
    }
    if (id === 'later') {
      out.innerHTML = `
        <div class="paper-card result-card"><h2 tabindex="-1">Come back to this</h2>
        <form class="stack" id="later-form">
          <label class="field"><span class="field-label">When will you come back to it?</span>
          <input name="when" maxlength="60" value="${esc(notes.when || 'Tomorrow after school')}"></label>
          <p class="hint">This only goes on tonight’s “Close the day” card as “Return to a thought: <em>when</em>”. The thought itself stays private.</p>
          <div class="btn-row"><button class="btn btn-primary" type="submit">Add to tonight’s card</button></div>
        </form></div>`;
      $('h2', out).focus();
      $('#later-form', out).addEventListener('submit', (e) => {
        e.preventDefault();
        const w = e.target.elements.when.value.trim() || 'later';
        canWait(`Return to a thought: ${w}.`);
        toast('Added to tonight’s card.', { action: { label: 'Open it', fn: () => { location.hash = '#close'; } } });
      });
      return;
    }
    if (id === 'plan') {
      out.innerHTML = `
        <div class="paper-card result-card"><h2 tabindex="-1">Make a small plan</h2>
        <p>Your private writing stays separate. If you want, create a task with its own short name — you choose what it says.</p>
        <div class="btn-row"><button class="btn btn-primary" type="button" data-task>Create a task</button></div></div>`;
      $('h2', out).focus();
      $('[data-task]', out).addEventListener('click', () => taskDialog());
    }
  }

  async function taskDialog() {
    const c = clock();
    await openDialog({
      title: 'Create a small task',
      build(b, close) {
        b.innerHTML = `
          <form class="stack" novalidate>
            <label class="field"><span class="field-label">Task name</span><input name="title" maxlength="80" placeholder="e.g. Email Ms Rahman about the deadline"><span class="field-error" id="pdt-e1" data-error-for="title" hidden></span></label>
            ${notes.action ? `<button class="btn btn-quiet btn-small" type="button" data-use>Use my small action as the name</button>` : ''}
            <label class="field"><span class="field-label">About how long? (minutes)</span><input name="minutes" type="number" min="5" max="240" step="5" value="15"><span class="field-error" id="pdt-e2" data-error-for="minutes" hidden></span></label>
            <label class="field"><span class="field-label">Finish by</span><input name="dueDate" type="date" value="${addDays(c.startDate, 1)}"></label>
            <label class="field"><span class="field-label">Time</span><input name="dueTime" type="time" value="20:00"></label>
            <div class="btn-row"><button class="btn btn-primary" type="submit">Add to my plan</button><button class="btn btn-secondary" type="button" data-cancel>Cancel</button></div>
          </form>`;
        const f = $('form', b);
        const use = $('[data-use]', b);
        if (use) use.addEventListener('click', () => { f.elements.title.value = notes.action.slice(0, 80); f.elements.title.focus(); });
        $('[data-cancel]', b).addEventListener('click', () => close());
        f.addEventListener('submit', (e) => {
          e.preventDefault();
          const t = { id: makeId('t'), title: f.elements.title.value.trim(), minutes: Number(f.elements.minutes.value), dueDate: f.elements.dueDate.value, dueTime: f.elements.dueTime.value, priority: 'medium', flexible: true, tonight: false, pins: [] };
          const errs = validateTask(t);
          ['title', 'minutes'].forEach((n) => fieldError(f, n, (errs.find((x) => x.field === n) || {}).msg));
          if (errs.length) return;
          updatePlan((p) => { p.tasks.push(t); }, `Add “${t.title}”`);
          decide(`Small plan: ${t.title}.`);
          toast(`Added “${t.title}” to your plan.`, { action: { label: 'See plan', fn: () => { location.hash = '#plan'; } } });
          close();
        });
      },
    });
  }

  function reset() {
    notes = { mind: '', action: '', when: '' };
    step = 0;
    noWrite = false;
    draw();
  }

  draw();
  return () => { notes = { mind: '', action: '', when: '' }; };
}
