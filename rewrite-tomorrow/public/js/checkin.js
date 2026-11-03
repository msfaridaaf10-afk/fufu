// "What's keeping me up?" — multi-select check-in, at most two follow-ups, then
// editable, optional suggestions. No scores, no required disclosure.
import { esc, $, $$, toast } from './ui.js';
import { state, decide, canWait, getPlan, schedule } from './store.js';
import { tonightWindow, fmtTime } from './scheduler.js';
import { supportBlock } from './support.js';

const OPTIONS = [
  { id: 'work', text: 'I have too much work.' },
  { id: 'thoughts', text: 'My thoughts won’t slow down.' },
  { id: 'happened', text: 'Something happened today.' },
  { id: 'scrolling', text: 'I keep scrolling.' },
  { id: 'notsleepy', text: 'I’m tired, but not sleepy.' },
  { id: 'surroundings', text: 'My surroundings make sleep difficult.' },
  { id: 'unsure', text: 'I’m not sure.' },
  { id: 'skip', text: 'I would rather skip this.' },
];

// Follow-up questions, in priority order. Only two are ever asked.
const FOLLOWUPS = {
  work: {
    q: 'Is something due tomorrow?',
    options: [['yes', 'Yes'], ['no', 'Not tomorrow'], ['unsure', 'Not sure']],
  },
  scrolling: {
    q: 'When would you like to put your phone down tonight?',
    time: true,
    options: [['away', 'Put it in another room'], ['across', 'Charge it across the room'], ['facedown', 'Face down, notifications off'], ['notsure', 'Not sure yet']],
  },
  surroundings: {
    q: 'What makes it hard? Pick any.',
    multi: true,
    options: [['noise', 'Noise'], ['light', 'Light'], ['temp', 'Too hot or cold'], ['sharing', 'Sharing a room'], ['unsafe', 'I don’t feel safe at home'], ['other', 'Something else']],
  },
  thoughts: {
    q: 'Would writing it down help, or would you rather not write tonight?',
    options: [['write', 'Writing might help'], ['talk', 'I’d rather talk it through'], ['nowrite', 'I don’t want to write']],
  },
  happened: {
    q: 'What would feel better right now?',
    options: [['talk', 'Talking it through'], ['calm', 'Something calm to do'], ['person', 'Thinking about who I could tell']],
  },
};
const FOLLOWUP_ORDER = ['work', 'scrolling', 'surroundings', 'thoughts', 'happened'];

const ENV_TIPS = {
  noise: 'If you have them, earplugs or a fan’s steady sound can soften noise. Asking the household for a “quiet after 22:00” agreement is another option.',
  light: 'Turn screens away from the bed, close curtains if you can, or try an eye mask or a T-shirt over your eyes.',
  temp: 'Layers you can add or remove help more than one heavy blanket. A slightly cooler room is often more comfortable for sleep.',
  sharing: 'If you share a room, you could agree on a lights-off time together, or use headphones for quiet audio instead of a speaker.',
  other: 'Pick one thing about your space you can change tonight — even small changes count. Some things aren’t in your control, and that’s not your fault.',
};

export function renderCheckin(el, params = []) {
  const s = { selected: new Set(params[0] ? [params[0]] : []), step: 'select', answers: {}, followups: [] };

  const draw = () => {
    if (s.step === 'select') drawSelect();
    else if (s.step === 'followup') drawFollowup();
    else drawResults();
    const h = $('h1, h2', el);
    if (h && document.body.dataset.booted && s.step !== 'select') { h.setAttribute('tabindex', '-1'); h.focus(); }
  };

  function drawSelect() {
    el.innerHTML = `
    <div class="single-column">
      <p class="kicker evidence-label">Check-in · 1 of 3</p>
      <h1>What’s keeping you up?</h1>
      <p class="lede">Choose any that fit. You don’t have to explain.</p>
      <form id="ci-form" class="ci-form">
        <fieldset>
          <legend class="visually-hidden">What’s keeping you up? Choose any.</legend>
          <div class="chip-grid">
            ${OPTIONS.map((o) => `<label class="chip-check"><input type="checkbox" name="why" value="${o.id}" ${s.selected.has(o.id) ? 'checked' : ''}><span>${esc(o.text)}</span></label>`).join('')}
          </div>
        </fieldset>
        <p class="form-error" id="ci-error" role="alert" hidden></p>
        <div class="btn-row">
          <button class="btn btn-primary" type="submit">Continue</button>
          <a class="btn btn-quiet" href="#close">Skip to winding down</a>
        </div>
      </form>
    </div>`;
    const form = $('#ci-form', el);
    form.addEventListener('change', (e) => {
      if (e.target.name !== 'why') return;
      // "skip" and "unsure" are exclusive with nothing — but skip clears others to stay simple
      if (e.target.value === 'skip' && e.target.checked) {
        $$('input[name="why"]', form).forEach((i) => { if (i.value !== 'skip') i.checked = false; });
      } else if (e.target.checked) {
        const skip = $('input[value="skip"]', form);
        skip.checked = false;
      }
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      s.selected = new Set($$('input[name="why"]:checked', form).map((i) => i.value));
      if (!s.selected.size) {
        const err = $('#ci-error', el);
        err.textContent = 'Choose at least one — “I’m not sure” and “I would rather skip this” both count.';
        err.hidden = false;
        return;
      }
      s.followups = FOLLOWUP_ORDER.filter((k) => s.selected.has(k)).slice(0, 2);
      s.fIndex = 0;
      s.step = s.followups.length ? 'followup' : 'results';
      draw();
    });
  }

  function drawFollowup() {
    const key = s.followups[s.fIndex];
    const f = FOLLOWUPS[key];
    const plan = getPlan();
    const tw = tonightWindow(plan, schedule(plan));
    const defaultTime = fmtTime(tw.protectStart);
    el.innerHTML = `
    <div class="single-column">
      <p class="kicker evidence-label">Check-in · 2 of 3 · question ${s.fIndex + 1} of ${s.followups.length}</p>
      <form id="fu-form" class="ci-form">
        <fieldset>
          <legend><h1 class="h1-like">${esc(f.q)}</h1></legend>
          ${f.time ? `<div class="field"><label for="fu-time">Phone down at</label><input id="fu-time" type="time" name="time" value="${esc(s.answers.scrollTime || defaultTime)}"><p class="hint">Your wind-down starts at ${esc(defaultTime)}. You can pick any time.</p></div><p class="field-label-like">Where could it go?</p>` : ''}
          <div class="chip-grid">
            ${f.options.map(([v, t]) => `<label class="chip-check"><input type="${f.multi ? 'checkbox' : 'radio'}" name="a" value="${v}"><span>${esc(t)}</span></label>`).join('')}
          </div>
        </fieldset>
        <div class="btn-row">
          <button class="btn btn-primary" type="submit">Continue</button>
          <button class="btn btn-quiet" type="button" id="fu-skip">You can skip this</button>
        </div>
      </form>
    </div>`;
    const next = () => {
      s.fIndex += 1;
      if (s.fIndex >= s.followups.length) s.step = 'results';
      draw();
    };
    $('#fu-skip', el).addEventListener('click', next);
    $('#fu-form', el).addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.target;
      const vals = $$('input[name="a"]:checked', form).map((i) => i.value);
      s.answers[key] = f.multi ? vals : vals[0];
      if (f.time) s.answers.scrollTime = $('#fu-time', form).value;
      next();
    });
  }

  function drawResults() {
    const recs = buildRecs(s);
    const unsafe = (s.answers.surroundings || []).includes('unsafe');
    el.innerHTML = `
    <div class="single-column">
      <p class="kicker evidence-label">Check-in · 3 of 3</p>
      <h1>${s.selected.has('skip') ? 'That’s okay.' : 'Here’s what might help tonight'}</h1>
      <p class="lede">${s.selected.has('skip') ? 'You don’t need to explain anything. Here are a few gentle options.' : 'These are suggestions, not instructions. Choose one, change it, or leave them all.'}</p>
      ${unsafe ? supportBlock({ compact: true }) : ''}
      <ul class="rec-list" role="list">
        ${recs.map((r, i) => recCard(r, i)).join('')}
      </ul>
      <div class="btn-row">
        <a class="btn btn-secondary" href="#close">Go to “Close the day”</a>
        <button class="btn btn-quiet" type="button" id="ci-again">Start the check-in again</button>
      </div>
    </div>`;
    $('#ci-again', el).addEventListener('click', () => { s.step = 'select'; s.answers = {}; draw(); });
    el.querySelectorAll('[data-rec-accept]').forEach((b) => b.addEventListener('click', () => {
      const r = recs[Number(b.dataset.recAccept)];
      const card = b.closest('.rec');
      let text = r.decision;
      if (r.editable) {
        const input = $('textarea, input', card);
        text = input.value.trim() || r.decision;
      }
      decide(text);
      if (r.waits) canWait(r.waits);
      card.classList.add('is-accepted');
      b.textContent = 'Added to tonight’s card';
      b.disabled = true;
      toast('Added to tonight’s “Close the day” card.', { action: { label: 'Open it', fn: () => { location.hash = '#close'; } } });
    }));
    el.querySelectorAll('[data-rec-dismiss]').forEach((b) => b.addEventListener('click', () => {
      const card = b.closest('.rec');
      card.classList.add('is-dismissed');
      card.setAttribute('aria-hidden', 'true');
      setTimeout(() => card.remove(), 10);
      toast('Okay, not tonight.');
    }));
  }

  draw();
}

function recCard(r, i) {
  return `
  <li class="rec paper-card ${r.tone ? `tone-${r.tone}` : ''}">
    <p class="rec-tag evidence-label">${esc(r.tag)}</p>
    <h2 class="rec-title">${esc(r.title)}</h2>
    <p>${esc(r.body)}</p>
    ${r.editable ? `<label class="field"><span class="field-label">Your version (edit if you like)</span><textarea rows="2">${esc(r.decision)}</textarea></label>` : ''}
    <div class="btn-row">
      ${r.href ? `<a class="btn btn-primary btn-small" href="${r.href}">${esc(r.cta)}</a>` : ''}
      ${r.decision ? `<button class="btn ${r.href ? 'btn-secondary' : 'btn-primary'} btn-small" type="button" data-rec-accept="${i}">${esc(r.acceptLabel || 'I’ll do this')}</button>` : ''}
      <button class="btn btn-quiet btn-small" type="button" data-rec-dismiss="${i}">Not tonight</button>
    </div>
  </li>`;
}

function buildRecs(s) {
  const sel = s.selected;
  const a = s.answers;
  const recs = [];
  if (sel.has('work')) {
    recs.push({
      tag: 'Practical planning',
      title: a.work === 'yes' ? 'See what actually fits tonight' : 'Let’s see what actually fits',
      body: a.work === 'yes'
        ? 'Compare what you planned with the time left before your wind-down. Flexible work can move, and nothing changes until you approve it.'
        : 'Put your tasks and deadlines in one place. The planner protects your sleep time first, then fits work around it.',
      href: a.work === 'yes' ? '#rewrite' : '#plan',
      cta: a.work === 'yes' ? 'Rewrite this evening' : 'Plan my week',
      tone: 'work',
    });
  }
  if (sel.has('thoughts')) {
    if (a.thoughts === 'talk') {
      recs.push({ tag: 'Optional reflection', title: 'Talk it through', body: 'Untangle can help you put it into words or find one small next step. It’s an optional tool — you choose AI or guided prompts.', href: '#untangle', cta: 'Open Untangle', tone: 'mind' });
    } else if (a.thoughts === 'nowrite') {
      recs.push({ tag: 'No writing needed', title: 'Notice it, then set it aside', body: 'Name the thought silently, decide “this can wait until tomorrow”, and try a few slow breaths. You don’t have to solve it tonight.', decision: 'Set my thoughts aside until tomorrow.', href: '#close', cta: 'Try slow breathing', tone: 'mind' });
    } else {
      recs.push({ tag: 'Thought offloading', title: 'Put it down for tonight', body: 'Write what’s on your mind on a paper card and choose what happens to it. Nothing you write is saved.', href: '#putdown', cta: 'Write it down', tone: 'mind' });
    }
  }
  if (sel.has('happened')) {
    recs.push({
      tag: 'Support',
      title: a.happened === 'calm' ? 'Something calm, for now' : 'You don’t have to carry it alone',
      body: a.happened === 'person'
        ? 'Think of one person you trust — a parent or carer, a friend, a teacher or the school counsellor. You could tell them tomorrow: “Something happened and I’d like to talk.”'
        : a.happened === 'calm'
          ? 'Slow breathing or a short grounding exercise can help your body settle. If it’s still on your mind tomorrow, talking to someone you trust can help.'
          : 'Untangle can help you put it into words, if you want. If it involves someone hurting you or you feel unsafe, please talk to a trusted adult — the support page lists numbers.',
      href: a.happened === 'calm' ? '#close' : a.happened === 'person' ? '#support' : '#untangle',
      cta: a.happened === 'calm' ? 'Try slow breathing' : a.happened === 'person' ? 'See support options' : 'Open Untangle',
      decision: a.happened === 'person' ? 'Tell someone I trust tomorrow.' : null,
      editable: a.happened === 'person',
      tone: 'support',
    });
  }
  if (sel.has('scrolling')) {
    const where = { away: 'in another room', across: 'charging across the room', facedown: 'face down with notifications off' }[a.scrolling];
    const time = a.scrollTime || '';
    const plan = `At ${time || 'my chosen time'}, my phone goes ${where || 'somewhere out of reach'}.`;
    state.session.stopPlan = plan;
    recs.push({
      tag: 'Your stopping plan',
      title: 'Choose when the scrolling stops',
      body: 'A plan you choose is easier to keep than “just stop”. Edit it so it’s realistic for you. An alarm or reminder can help — set it yourself if you’d like.',
      decision: plan,
      editable: true,
      acceptLabel: 'Use this plan',
      tone: 'rest',
    });
  }
  if (sel.has('notsleepy')) {
    recs.push({
      tag: 'Low pressure',
      title: 'You don’t have to force sleep',
      body: 'Trying hard to fall asleep can make it harder. Dim the lights and do something quiet and screen-free — reading paper pages, gentle stretching or slow breathing — until you feel sleepy. Rest still counts.',
      href: '#close',
      cta: 'Try slow breathing',
      decision: 'Do something quiet in dim light until I feel sleepy.',
      tone: 'rest',
    });
  }
  if (sel.has('surroundings')) {
    const picks = (a.surroundings || []).filter((x) => x !== 'unsafe');
    const tips = (picks.length ? picks : ['other']).map((p) => ENV_TIPS[p]).join(' ');
    recs.push({
      tag: 'Within your control',
      title: 'One small change to your space',
      body: tips,
      decision: 'Change one thing about my space tonight.',
      editable: true,
      tone: 'rest',
    });
  }
  if (sel.has('unsure') || sel.has('skip') || !recs.length) {
    recs.push({ tag: 'Gentle start', title: 'Wind down without a plan', body: 'Close the day, try a minute of comfortable breathing, then put the screen down when you’re ready.', href: '#close', cta: 'Close the day', tone: 'rest' });
    if (!sel.has('skip')) recs.push({ tag: 'Optional', title: 'Talk it through', body: 'Not sure what’s going on? Untangle can help you find words for it — or not. Either is fine.', href: '#untangle', cta: 'Open Untangle', tone: 'mind' });
  }
  return recs;
}
