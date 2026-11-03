// Untangle — optional reflection. Live AI (via our server → Anthropic) when
// configured and chosen; otherwise clearly labelled guided reflection on-device.
// Conversations live only in memory and are cleared on "I'm done for tonight".
import { esc, $, $$, toast, openDialog, announce, fieldError } from './ui.js';
import { state, decide, canWait, keepSummary, deleteSummary, updatePlan, clock, isDemo } from './store.js';
import { needsSupport } from './safety.js';
import { supportBlock } from './support.js';
import { addDays, makeId, validateTask } from './scheduler.js';

const OPENING = 'What feels hardest to put down tonight?';
const FOCUS = {
  explain: { label: 'Help me put it into words', chip: 'Help me explain', ask: 'Can you help me put this into words?' },
  step: { label: 'Help me find a small next step', chip: 'Find one next step', ask: 'Can you help me find one small next step?' },
  plan: { label: 'Help me make a plan', chip: 'Make a plan', ask: 'Can you help me make a plan?' },
};

let aiStatus = null; // cached { ai: boolean } | { ai: false, error: true }
async function checkStatus() {
  if (aiStatus) return aiStatus;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch('api/status', { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    clearTimeout(t);
    if (r.status === 404 || r.status === 405) { aiStatus = { ai: false }; return aiStatus; } // static hosting: no AI server
    if (!r.ok) throw new Error('status');
    const j = await r.json().catch(() => ({}));
    aiStatus = { ai: !!j.ai, provider: j.provider || null };
  } catch {
    aiStatus = { ai: false, error: true };
  }
  return aiStatus;
}

const SUPPORT_REPLY = 'Thank you for telling me. What you’re describing sounds serious, and you deserve support from a real person right now. Please reach out to a trusted adult, or if you’re in danger, call emergency services. I can’t contact anyone or check on you, but the people and numbers below can help.';

// ------------------------------------------------------------ guided engine
const GUIDED = {
  explain: [
    'Thanks for putting that into words. What part of it keeps coming back the most?',
    'If you gave it a short name — just a few words — what would it be?',
    'Is this something you could do anything about tomorrow, or more something to notice and let be for now? Either answer is okay.',
  ],
  step: [
    'Okay. Is there any small part of this you could act on tomorrow? It’s fine if the answer is no.',
    'What’s the smallest version of that — something that would take 15 minutes or less?',
    'When could you do it? And is there anything that can wait until after that?',
  ],
  plan: [
    'Let’s sort it out. What absolutely has to be done by tomorrow?',
    'And what could wait a day or two, even if you’d rather finish it now?',
    'You can open “Rewrite this evening” to see what fits before your sleep time. Nothing changes until you approve it. Want a short summary first?',
  ],
};

function acknowledge(text) {
  const t = text.toLowerCase();
  if (/(guilt|guilty|lazy|should be (studying|working))/.test(t) && /(sleep|bed|rest|stop)/.test(t)) return 'It sounds like stopping feels risky when there’s still work left.';
  if (/(everything|all of it).*(tonight|now)|(fail|ruin|disaster)/.test(t)) return 'It can feel like everything has to be finished tonight. Is that definitely true, or could some of it wait?';
  if (/(worr|anxious|nervous|scared|stress)/.test(t)) return 'That sounds like a lot to be carrying at night.';
  if (/(tired|exhausted|can'?t sleep|awake)/.test(t)) return 'Being tired but unable to switch off is really frustrating.';
  if (/(friend|argument|fight|parents?|mum|mom|dad|sister|brother)/.test(t)) return 'Things with people we care about can stay with us long after the day ends.';
  return 'Thanks for sharing that.';
}

function guidedReply(conv) {
  const userMsgs = conv.messages.filter((m) => m.role === 'user');
  const last = userMsgs[userMsgs.length - 1].content;
  const script = GUIDED[conv.focus || 'explain'];
  const i = Math.min(conv.guidedStep, script.length - 1);
  const done = conv.guidedStep >= script.length;
  conv.guidedStep += 1;
  if (done) return 'Thanks. You’ve done enough thinking for tonight. You can make a short summary, or stop here.';
  const ack = conv.guidedStep === 1 ? acknowledge(last) : '';
  return `${ack ? `${ack} ` : ''}${script[i]}`;
}

function guidedSummary(conv) {
  const u = conv.messages.filter((m) => m.role === 'user' && !Object.values(FOCUS).some((f) => f.ask === m.content)).map((m) => m.content.trim());
  const cut = (s, n = 160) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s || '');
  if (conv.focus === 'plan') {
    return { onMind: cut(u[0]), oneThing: cut(u[1]) || 'Check what fits tonight in “Rewrite this evening”.', canWait: cut(u[2]) || 'Anything that isn’t due tomorrow.' };
  }
  if (conv.focus === 'step') {
    return { onMind: cut(u[0]), oneThing: cut(u[2] || u[1]) || 'Nothing tonight — that’s okay.', canWait: cut(u[3]) || 'Everything else, until after that small step.' };
  }
  return { onMind: cut(u[2] || u[0]), oneThing: 'Nothing tonight — that’s okay.', canWait: 'Thinking more about this. It can wait until tomorrow.' };
}

// ------------------------------------------------------------ view
export function renderUntangle(el) {
  const conv = {
    mode: null, // 'ai' | 'guided'
    focus: null,
    messages: [],
    guidedStep: 0,
    support: false,
    busy: false,
    summaryOffered: false,
  };

  el.innerHTML = `
  <div class="untangle">
    <div class="page-head narrow">
      <p class="kicker evidence-label">Untangle · optional</p>
      <h1>${esc(OPENING)}</h1>
      <p class="lede">Talk it through, find one small next step, or make a plan. Stop whenever you like.</p>
    </div>
    <div id="ut-body" class="ut-body"><p class="loading" role="status">Checking what’s available…</p></div>
  </div>`;
  const body = $('#ut-body', el);

  checkStatus().then((st) => { if (body.isConnected) drawGate(st); });

  function drawGate(st) {
    body.innerHTML = `
    <section class="paper-sheet gate" aria-labelledby="gate-h">
      <h2 id="gate-h">Before you start</h2>
      <p><strong>Untangle is a reflection and planning tool.</strong> It isn’t a therapist, a friend, a diagnosis or an emergency service.</p>
      <div class="gate-options">
        <article class="gate-option ${st.ai ? '' : 'is-unavailable'}">
          <h3>AI reflection</h3>
          ${st.ai
            ? `<ul class="tight">
                <li>Your messages leave this device. They go to this site’s server and to <strong>Anthropic’s Claude API</strong>, which writes the replies.</li>
                <li>Our server doesn’t store or log what you write. Anthropic may keep API data for a limited time under its own policies.</li>
                <li>The conversation isn’t saved here. It’s cleared when you stop or leave.</li>
                <li>Please leave out names and other details that identify you or others.</li>
              </ul>
              <button class="btn btn-primary" type="button" data-mode="ai">Use AI reflection</button>`
            : `<p>${st.error ? 'AI reflection can’t be reached right now.' : 'AI reflection isn’t set up on this website.'} You can use guided reflection instead — it works the same way, with pre-written prompts.</p>`}
        </article>
        <article class="gate-option">
          <h3>Guided reflection</h3>
          <ul class="tight">
            <li>Nothing leaves this device.</li>
            <li>Replies are pre-written prompts, <strong>not AI</strong>.</li>
            <li>Nothing is saved unless you choose to keep a summary.</li>
          </ul>
          <button class="btn ${st.ai ? 'btn-secondary' : 'btn-primary'}" type="button" data-mode="guided">Use guided reflection</button>
        </article>
      </div>
      <p class="hint">More detail in <a href="#privacy">Privacy &amp; your data</a>. ${kept().length ? '' : ''}</p>
    </section>
    ${keptSummariesHTML()}`;
    $$('[data-mode]', body).forEach((b) => b.addEventListener('click', () => { conv.mode = b.dataset.mode; drawChat(); }));
    wireKept();
  }

  function kept() { return state.personal.summaries || []; }
  function keptSummariesHTML() {
    if (!kept().length) return '';
    return `<section class="kept paper-sheet" aria-labelledby="kept-h"><h2 id="kept-h">Summaries you kept</h2><ul class="kept-list">${kept().map((s, i) => `
      <li><p><strong>On your mind:</strong> ${esc(s.onMind)}</p><p><strong>One thing:</strong> ${esc(s.oneThing)}</p><p><strong>Can wait:</strong> ${esc(s.canWait)}</p><p class="hint">${esc(s.date || '')}</p>
      <button class="btn btn-quiet btn-small" type="button" data-del-summary="${i}">Delete this summary</button></li>`).join('')}</ul></section>`;
  }
  function wireKept() {
    $$('[data-del-summary]', body).forEach((b) => b.addEventListener('click', () => {
      deleteSummary(Number(b.dataset.delSummary));
      toast('Summary deleted.');
      drawGate(aiStatus || { ai: false });
    }));
  }

  function drawChat() {
    body.innerHTML = `
    <section class="chat" aria-label="Untangle conversation">
      <p class="mode-pill ${conv.mode === 'ai' ? 'is-ai' : 'is-guided'}">${conv.mode === 'ai' ? 'AI reflection · replies written by Claude (Anthropic)' : 'Guided reflection · pre-written prompts, not AI'}</p>
      <div class="thread" id="thread" role="log" aria-live="polite" aria-relevant="additions">
        <div class="msg msg-tool"><p>${esc(OPENING)}</p><p class="hint">You can start with one of these, or just type.</p>
          <div class="starter-row">${Object.entries(FOCUS).map(([k, f]) => `<button class="btn btn-secondary btn-small" type="button" data-start="${k}">${esc(f.label)}</button>`).join('')}</div>
        </div>
      </div>
      <div id="typing" class="typing" hidden><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span> <span>Writing a reply…</span></div>
      <form id="chat-form" class="chat-form">
        <label for="chat-input" class="visually-hidden">Your message</label>
        <textarea id="chat-input" name="msg" rows="2" maxlength="1500" placeholder="Type as much or as little as you like…"></textarea>
        <button class="btn btn-primary" type="submit">Send</button>
      </form>
      <p class="form-error" id="chat-error" role="alert" hidden></p>
      <div class="chat-actions" role="group" aria-label="Conversation actions">
        <button class="btn btn-quiet btn-small" type="button" data-focus="explain">${FOCUS.explain.chip}</button>
        <button class="btn btn-quiet btn-small" type="button" data-focus="step">${FOCUS.step.chip}</button>
        <button class="btn btn-quiet btn-small" type="button" data-focus="plan" id="act-plan">${FOCUS.plan.chip}</button>
        <button class="btn btn-quiet btn-small" type="button" id="act-summary" hidden>Summarise</button>
        <button class="btn btn-stop btn-small" type="button" id="act-stop">Stop · I’m done for tonight</button>
      </div>
    </section>`;

    const thread = $('#thread', body);
    const input = $('#chat-input', body);
    input.focus();

    $$('[data-start]', body).forEach((b) => b.addEventListener('click', () => {
      conv.focus = b.dataset.start;
      $$('[data-start]', body).forEach((x) => { x.disabled = true; });
      toolMessage(`Okay — ${FOCUS[conv.focus].label.toLowerCase().replace('help me ', 'let’s ')}. ${conv.focus === 'plan' ? 'What’s on your list?' : 'What’s on your mind?'}`);
      input.focus();
    }));
    $$('[data-focus]', body).forEach((b) => b.addEventListener('click', () => {
      conv.focus = b.dataset.focus;
      conv.guidedStep = 0;
      if (conv.focus === 'plan' && conv.messages.length) offerPlanBridge();
      if (!conv.messages.length) {
        toolMessage(`${FOCUS[conv.focus].label}. What’s on your mind?`);
        input.focus();
        return;
      }
      send(FOCUS[conv.focus].ask);
    }));
    $('#act-summary', body).addEventListener('click', makeSummary);
    $('#act-stop', body).addEventListener('click', stop);

    $('#chat-form', body).addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      const err = $('#chat-error', body);
      if (!text) { err.textContent = 'Type something first — or use one of the buttons below.'; err.hidden = false; return; }
      err.hidden = true;
      input.value = '';
      send(text);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#chat-form', body).requestSubmit(); }
    });

    function bubble(role, text, extraClass = '') {
      const d = document.createElement('div');
      d.className = `msg msg-${role} ${extraClass}`;
      const label = role === 'user' ? 'You' : conv.mode === 'ai' ? 'Untangle (AI)' : 'Guided prompt';
      d.innerHTML = `<p class="msg-who">${label}</p><p>${esc(text).replace(/\n/g, '<br>')}</p>`;
      thread.append(d);
      d.scrollIntoView({ block: 'nearest' });
      return d;
    }
    function toolMessage(text) {
      const d = document.createElement('div');
      d.className = 'msg msg-tool';
      d.innerHTML = `<p>${esc(text)}</p>`;
      thread.append(d);
      return d;
    }
    function showSupport() {
      if (thread.querySelector('.support-card')) return;
      const d = document.createElement('div');
      d.className = 'msg msg-support';
      d.innerHTML = supportBlock({ compact: true });
      thread.append(d);
      $('#act-plan', body).hidden = true;
      $$('[data-focus="step"]', body).forEach((x) => { x.hidden = true; });
    }

    async function send(text) {
      if (conv.busy) return;
      if (conv.messages.length >= 28) {
        toolMessage('This conversation is getting long. It might be a good moment to summarise or stop for tonight.');
        $('#act-summary', body).hidden = false;
        return;
      }
      conv.messages.push({ role: 'user', content: text.slice(0, 1500) });
      bubble('user', text);
      const flagged = needsSupport(text);
      if (flagged) conv.support = true;

      let reply;
      if (conv.mode === 'guided') {
        reply = conv.support ? (flagged ? SUPPORT_REPLY : 'I’m still here as a set of prompts, but please do reach out to a real person about what you shared. You can stop at any time.') : guidedReply(conv);
        conv.messages.push({ role: 'assistant', content: reply });
        bubble('assistant', reply);
      } else {
        conv.busy = true;
        $('#typing', body).hidden = false;
        announce('Writing a reply');
        try {
          const r = await fetch('api/untangle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: conv.messages, focus: conv.focus }),
          });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw Object.assign(new Error(j.error || 'failed'), { code: j.error, status: r.status });
          if (j.refused || !j.reply) {
            reply = conv.support ? SUPPORT_REPLY : 'I can’t help with that one, but I’m happy to help you think about tonight or tomorrow’s plan.';
          } else reply = j.reply;
          if (j.support) conv.support = true;
          conv.messages.push({ role: 'assistant', content: reply });
          bubble('assistant', reply);
        } catch (err) {
          conv.messages.pop(); // let them resend
          const d = toolMessage('');
          const why = err.status === 429 ? 'Too many messages in a short time.' : err.code === 'not_configured' ? 'AI reflection isn’t set up on this server.' : 'The AI service couldn’t be reached.';
          d.innerHTML = `<p>${esc(why)} Your message wasn’t lost:</p><blockquote>${esc(text)}</blockquote>
            <div class="btn-row"><button class="btn btn-secondary btn-small" type="button" data-retry>Try again</button>
            <button class="btn btn-secondary btn-small" type="button" data-guided>Switch to guided reflection</button></div>`;
          $('[data-retry]', d).addEventListener('click', () => { d.remove(); thread.lastElementChild?.classList.contains('msg-user') && thread.lastElementChild.remove(); send(text); });
          $('[data-guided]', d).addEventListener('click', () => {
            conv.mode = 'guided';
            $('.mode-pill', body).textContent = 'Guided reflection · pre-written prompts, not AI';
            $('.mode-pill', body).className = 'mode-pill is-guided';
            d.remove();
            thread.lastElementChild?.classList.contains('msg-user') && thread.lastElementChild.remove();
            send(text);
          });
        } finally {
          conv.busy = false;
          $('#typing', body).hidden = true;
        }
      }
      if (conv.support) showSupport();
      const userCount = conv.messages.filter((m) => m.role === 'user').length;
      if (userCount >= 3 && !conv.summaryOffered && !conv.support) {
        conv.summaryOffered = true;
        $('#act-summary', body).hidden = false;
        const d = toolMessage('');
        d.innerHTML = `<p>Would a short summary help? It would show what’s on your mind, one thing you could do, and what can wait.</p>
          <div class="btn-row"><button class="btn btn-secondary btn-small" type="button" data-sum>Yes, summarise</button>
          <button class="btn btn-quiet btn-small" type="button" data-nosum>Not now</button></div>`;
        $('[data-sum]', d).addEventListener('click', () => { d.remove(); makeSummary(); });
        $('[data-nosum]', d).addEventListener('click', () => d.remove());
      }
    }

    function offerPlanBridge() {
      const d = toolMessage('');
      d.innerHTML = `<p>Want to look at a possible change to tonight’s plan? You’ll see the change first, and nothing is applied unless you approve it.</p>
        <div class="btn-row"><a class="btn btn-secondary btn-small" href="#rewrite">Open “Rewrite this evening”</a></div>`;
    }

    async function makeSummary() {
      if (conv.busy) return;
      if (!conv.messages.some((m) => m.role === 'user')) { toolMessage('Say a little first, then I can summarise.'); return; }
      let summary;
      if (conv.mode === 'ai') {
        conv.busy = true;
        $('#typing', body).hidden = false;
        try {
          const r = await fetch('api/untangle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: conv.messages, mode: 'summary' }) });
          const j = await r.json().catch(() => ({}));
          if (!r.ok || !j.summary) throw new Error('summary');
          summary = j.summary;
        } catch {
          summary = guidedSummary(conv);
          toolMessage('The AI summary didn’t work, so here’s a simple one built from your own words. Edit anything.');
        } finally {
          conv.busy = false;
          $('#typing', body).hidden = true;
        }
      } else {
        summary = guidedSummary(conv);
      }
      drawSummary(summary);
    }

    function drawSummary(sum) {
      const d = document.createElement('div');
      d.className = 'msg msg-summary';
      const ids = { a: 'sm-a', b: 'sm-b', c: 'sm-c' };
      d.innerHTML = `
        <div class="summary-card paper-card">
          <p class="evidence-label">Summary · you can edit this</p>
          <label class="field" for="${ids.a}"><span class="field-label">What’s on your mind</span><textarea id="${ids.a}" rows="2">${esc(sum.onMind)}</textarea></label>
          <label class="field" for="${ids.b}"><span class="field-label">One thing you could do</span><textarea id="${ids.b}" rows="2">${esc(sum.oneThing)}</textarea></label>
          <label class="field" for="${ids.c}"><span class="field-label">What can wait</span><textarea id="${ids.c}" rows="2">${esc(sum.canWait)}</textarea></label>
          <div class="btn-row">
            <button class="btn btn-primary btn-small" type="button" data-close-card>Add to tonight’s card</button>
            <button class="btn btn-secondary btn-small" type="button" data-task>Turn “one thing” into a task?</button>
            <button class="btn btn-secondary btn-small" type="button" data-keep ${state.prefs.save && !isDemo() ? '' : 'disabled aria-describedby="keep-note"'}>Keep this summary</button>
          </div>
          ${state.prefs.save && !isDemo() ? '' : `<p class="hint" id="keep-note">${isDemo() ? 'Summaries aren’t kept during the sample day.' : 'To keep summaries, turn on saving in Settings. Only the summary is kept — never the conversation.'}</p>`}
        </div>`;
      thread.append(d);
      d.scrollIntoView({ block: 'nearest' });
      const val = () => ({ onMind: $(`#${ids.a}`, d).value.trim(), oneThing: $(`#${ids.b}`, d).value.trim(), canWait: $(`#${ids.c}`, d).value.trim() });
      $('[data-close-card]', d).addEventListener('click', (e) => {
        const v = val();
        if (v.oneThing) decide(v.oneThing);
        if (v.canWait) canWait(v.canWait);
        e.target.textContent = 'Added';
        e.target.disabled = true;
        toast('Added to tonight’s “Close the day” card.', { action: { label: 'Open it', fn: () => { location.hash = '#close'; } } });
      });
      $('[data-keep]', d).addEventListener('click', (e) => {
        keepSummary({ ...val(), date: new Date().toLocaleDateString() });
        e.target.textContent = 'Kept on this device';
        e.target.disabled = true;
        toast('Summary kept on this device. You can delete it from the Untangle page.');
      });
      $('[data-task]', d).addEventListener('click', () => proposeTask(val().oneThing));
    }

    async function proposeTask(text) {
      const c = clock();
      const tomorrow = addDays(c.startDate, 1);
      await openDialog({
        title: 'Add this to your plan?',
        build(b, close) {
          b.innerHTML = `
            <p>This would add one task to your study plan. Check it first — nothing is added until you press “Add to my plan”.</p>
            <form class="stack" novalidate>
              <label class="field"><span class="field-label">Task</span><input name="title" value="${esc(text.slice(0, 80))}" maxlength="80"><span class="field-error" id="pt-e-title" data-error-for="title" hidden></span></label>
              <label class="field"><span class="field-label">About how long? (minutes)</span><input name="minutes" type="number" min="5" max="240" step="5" value="15"><span class="field-error" id="pt-e-min" data-error-for="minutes" hidden></span></label>
              <label class="field"><span class="field-label">Finish by</span><input name="dueDate" type="date" value="${tomorrow}"></label>
              <label class="field"><span class="field-label">Time</span><input name="dueTime" type="time" value="20:00"></label>
              <div class="btn-row"><button class="btn btn-primary" type="submit">Add to my plan</button><button class="btn btn-secondary" type="button" data-cancel>Don’t add</button></div>
            </form>`;
          const f = $('form', b);
          $('[data-cancel]', b).addEventListener('click', () => close(false));
          f.addEventListener('submit', (e) => {
            e.preventDefault();
            const t = { id: makeId('t'), title: f.elements.title.value.trim(), minutes: Number(f.elements.minutes.value), dueDate: f.elements.dueDate.value, dueTime: f.elements.dueTime.value, priority: 'medium', flexible: true, tonight: false, pins: [] };
            const errs = validateTask(t);
            ['title', 'minutes'].forEach((n) => fieldError(f, n, (errs.find((x) => x.field === n) || {}).msg));
            if (errs.length) return;
            updatePlan((p) => { p.tasks.push(t); }, `Add “${t.title}”`);
            toast(`Added “${t.title}” to your plan.`, { action: { label: 'See plan', fn: () => { location.hash = '#plan'; } } });
            close(true);
          });
        },
      });
    }

    function stop() {
      conv.messages = [];
      conv.focus = null;
      body.innerHTML = `
      <section class="stop-panel paper-sheet" aria-labelledby="stop-h">
        <div class="quiet-check" aria-hidden="true"><svg viewBox="0 0 48 48" width="48" height="48"><circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15 25l6 6 12-14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
        <h2 id="stop-h" tabindex="-1">Okay. That’s enough for tonight.</h2>
        <p>The conversation has been cleared from this page.${conv.support ? ' Please do talk to someone you trust about what you shared.' : ''}</p>
        <div class="btn-row"><a class="btn btn-primary" href="#close">Close the day</a><a class="btn btn-quiet" href="#home">Back to start</a></div>
      </section>`;
      $('#stop-h', body).focus();
    }
  }

  return () => { conv.messages = []; };
}
