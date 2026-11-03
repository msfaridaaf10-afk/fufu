import { state, subscribe, setPref, enterDemo, exitDemo, isDemo, deleteEverything, persist } from './store.js';
import { esc, $, $$, toast, confirmDialog, announce } from './ui.js';
import { brainSVG, lightFragment } from './brain.js';
import { renderCheckin } from './checkin.js';
import { renderUntangle } from './untangle.js';
import { renderPutDown } from './putdown.js';
import { renderPlanner } from './planner.js';
import { renderRewrite } from './rewrite.js';
import { renderClose } from './close.js';
import { renderMorning } from './morning.js';
import { renderEvidence } from './evidence.js';
import { supportBlock } from './support.js';

const root = document.documentElement;
const main = document.getElementById('main');

// ------------------------------------------------------------ appearance
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
function effectiveDark() {
  return state.prefs.theme === 'dark' || (state.prefs.theme === 'system' && darkQuery.matches);
}
function applyPrefs() {
  root.dataset.theme = state.prefs.theme;
  root.dataset.accent = state.prefs.accent;
  root.dataset.texture = state.prefs.texture ? 'on' : 'off';
  root.dataset.motion = state.prefs.motion;
  const sw = $('#mode-switch');
  const dark = effectiveDark();
  sw.setAttribute('aria-pressed', String(dark));
  sw.querySelector('.mode-switch-label').textContent = 'Night mode';
  root.classList.toggle('is-night', dark);
}
darkQuery.addEventListener('change', applyPrefs);
$('#mode-switch').addEventListener('click', () => {
  setPref('theme', effectiveDark() ? 'light' : 'dark');
  announce(effectiveDark() ? 'Night mode on' : 'Day mode on');
});

// ------------------------------------------------------------ nav
document.querySelector('.skip-link').addEventListener('click', (e) => {
  e.preventDefault();
  main.focus();
});
const menuBtn = $('.menu-toggle');
const nav = $('#site-nav');
menuBtn.addEventListener('click', () => {
  const open = menuBtn.getAttribute('aria-expanded') === 'true';
  menuBtn.setAttribute('aria-expanded', String(!open));
  nav.classList.toggle('is-open', !open);
});
nav.addEventListener('click', (e) => {
  if (e.target.closest('a')) {
    menuBtn.setAttribute('aria-expanded', 'false');
    nav.classList.remove('is-open');
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && nav.classList.contains('is-open')) {
    menuBtn.setAttribute('aria-expanded', 'false');
    nav.classList.remove('is-open');
    menuBtn.focus();
  }
});

function updateDemoBanner() {
  const b = $('#demo-banner');
  b.hidden = !isDemo();
  if (isDemo()) $('#demo-label').textContent = state.demo.label;
}
$('#exit-demo').addEventListener('click', () => {
  exitDemo();
  toast('You’ve left the sample day. Your own plan is unchanged.');
  if (location.hash.startsWith('#plan') || location.hash.startsWith('#rewrite')) route();
});

// ------------------------------------------------------------ router
const routes = {
  '': renderHome,
  checkin: renderCheckin,
  untangle: renderUntangle,
  putdown: renderPutDown,
  plan: renderPlanner,
  rewrite: renderRewrite,
  close: renderClose,
  morning: renderMorning,
  evidence: renderEvidence,
  preferences: renderSettings,
  privacy: renderPrivacy,
  support: renderSupport,
  about: renderAbout,
};

let cleanup = null;
function route() {
  // Plain '#name' addresses (old '#/name' links still work). 'checkin-thoughts' → route 'checkin', param 'thoughts'.
  const hash = location.hash.replace(/^#\/?/, '');
  let [name, ...rest] = hash.split(/[/-]/);
  if (name === 'home') name = '';
  if (name === 'settings') name = 'preferences';
  const view = routes[name] || renderNotFound;
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
  main.innerHTML = '';
  main.className = `view view-${name || 'home'}`;
  cleanup = view(main, rest) || null;
  $$('#site-nav a').forEach((a) => {
    const target = a.getAttribute('href').replace(/^#\/?/, '');
    if (target === name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  updateDemoBanner();
  const h1 = main.querySelector('h1');
  if (document.body.dataset.booted) {
    window.scrollTo({ top: 0 });
    (h1 || main).setAttribute('tabindex', '-1');
    (h1 || main).focus({ preventScroll: true });
  }
  document.body.dataset.booted = '1';
  document.title = h1 && name ? `${h1.textContent.trim()} · Rewrite Tomorrow` : 'Rewrite Tomorrow';
}
window.addEventListener('hashchange', route);
subscribe((e) => {
  if (e.type === 'prefs') applyPrefs();
  if (e.type === 'mode') updateDemoBanner();
  if (e.type === 'reset') { applyPrefs(); route(); }
});

// ------------------------------------------------------------ home
function renderHome(el) {
  el.innerHTML = `
  <section class="hero">
    <div class="hero-copy">
      <p class="kicker"><span class="evidence-label">Rewrite Tomorrow</span> Give tomorrow a better beginning.</p>
      <h1 class="display">Tomorrow starts with what you need <em>tonight.</em></h1>
      <p class="lede">Untangle your thoughts, make room for rest, and build a study plan you can actually live with.</p>
      <div class="btn-row">
        <a class="btn btn-primary btn-large" href="#checkin">What’s keeping me up?</a>
        <a class="btn btn-secondary btn-large" href="#plan">Plan my week</a>
      </div>
      <p class="hero-note">No account. Nothing is saved unless you choose to. You can stop at any point.</p>
    </div>
    <figure class="hero-art paper-sheet">
      <div class="brain-wrap">${brainSVG()}</div>
      <figcaption>A paper collage based on our handmade case-book brain. It’s a metaphor, not a map of where feelings live.</figcaption>
    </figure>
  </section>

  <section class="entry" aria-labelledby="entry-h">
    <h2 id="entry-h" class="section-title">Where would you like to start?</h2>
    <div class="night-only night-note">
      <p>It’s night mode, so we’re showing less. You only need one of these — or none.</p>
      <button type="button" class="btn btn-quiet btn-small" id="show-all">Show everything</button>
    </div>
    <ul class="entry-cards" role="list">
      <li><a class="entry-card card-mind" href="#checkin-thoughts" data-frag="mind">
        <span class="entry-tag evidence-label">Exhibit A</span>
        <span class="entry-title">My head feels full.</span>
        <span class="entry-sub">Sort out what’s on your mind, write it down, or just set it aside.</span>
        <span class="entry-go" aria-hidden="true">→</span></a></li>
      <li><a class="entry-card card-work" href="#rewrite" data-frag="work">
        <span class="entry-tag evidence-label">Exhibit B</span>
        <span class="entry-title">My work won’t fit.</span>
        <span class="entry-sub">See what really fits before your sleep time, and what could move.</span>
        <span class="entry-go" aria-hidden="true">→</span></a></li>
      <li><a class="entry-card card-rest" href="#close" data-frag="rest">
        <span class="entry-tag evidence-label">Exhibit C</span>
        <span class="entry-title">I want to wind down.</span>
        <span class="entry-sub">Close the day, try some slow breathing, and put the screen down.</span>
        <span class="entry-go" aria-hidden="true">→</span></a></li>
    </ul>
    <div class="explore-row">
      <a class="btn btn-quiet" href="#explore" id="just-explore">Just explore</a>
      <button class="btn btn-quiet" type="button" id="try-sample">Explore a sample day</button>
      <a class="btn btn-quiet" href="#evidence">Explore the evidence behind Stolen: Tomorrow</a>
    </div>
  </section>

  <section class="journey torn-top night-hide" id="explore" aria-labelledby="journey-h" tabindex="-1">
    <div class="journey-inner">
      <h2 id="journey-h" class="section-title">One evening, five small steps</h2>
      <p class="section-sub">Use one, use all of them, or leave whenever you’re ready.</p>
      <ol class="journey-steps">
        <li><a href="#checkin"><span class="step-num">01</span><span class="step-q">What is keeping me up?</span><span class="step-a">A quick check-in. Skip anything.</span></a></li>
        <li><a href="#untangle"><span class="step-num">02</span><span class="step-q">What might help tonight?</span><span class="step-a">Talk it through, or write it down and put it away.</span></a></li>
        <li><a href="#rewrite"><span class="step-num">03</span><span class="step-q">What can change in my plan?</span><span class="step-a">Rewrite this evening without giving up sleep.</span></a></li>
        <li><a href="#close"><span class="step-num">04</span><span class="step-q">Let me put my phone down.</span><span class="step-a">Gather your decisions. You can stop here.</span></a></li>
        <li><a href="#morning"><span class="step-num">05</span><span class="step-q">What did I notice this morning?</span><span class="step-a">Four optional questions, then on with your day.</span></a></li>
      </ol>
    </div>
  </section>`;

  const wrap = $('.brain-wrap', el);
  $$('.entry-card', el).forEach((card) => {
    const on = () => lightFragment(wrap, card.dataset.frag);
    const off = () => lightFragment(wrap, null);
    card.addEventListener('mouseenter', on);
    card.addEventListener('focus', on);
    card.addEventListener('mouseleave', off);
    card.addEventListener('blur', off);
  });
  $('#show-all', el).addEventListener('click', () => {
    el.classList.add('show-all');
    const t = $('#explore', el);
    t.focus({ preventScroll: true });
  });
  $('#just-explore', el).addEventListener('click', (e) => {
    e.preventDefault();
    el.classList.add('show-all');
    const t = $('#explore', el);
    t.scrollIntoView({ behavior: document.documentElement.dataset.motion === 'reduce' ? 'auto' : 'smooth' });
    t.focus({ preventScroll: true });
  });
  $('#try-sample', el).addEventListener('click', () => {
    enterDemo();
    location.hash = '#rewrite';
    toast('Sample day loaded: a fictional student’s Monday at 17:30.');
  });
}

// ------------------------------------------------------------ settings
function renderSettings(el) {
  const p = state.prefs;
  const radio = (name, value, labelText, current) =>
    `<label class="choice"><input type="radio" name="${name}" value="${value}" ${current === value ? 'checked' : ''}><span>${labelText}</span></label>`;
  el.innerHTML = `
  <div class="page-head">
    <p class="kicker evidence-label">Settings</p>
    <h1>Make it comfortable</h1>
    <p class="lede">Everything here is optional. Appearance choices are remembered on this device so the page looks right next time.</p>
  </div>
  <form class="settings paper-sheet" id="settings-form">
    <fieldset class="field-group">
      <legend>Appearance</legend>
      <div class="choices">${radio('theme', 'system', 'Match my device', p.theme)}${radio('theme', 'light', 'Day (light)', p.theme)}${radio('theme', 'dark', 'Night (dark)', p.theme)}</div>
      <p class="hint">Night mode is easier on the eyes in a dark room. It isn’t a sleep treatment.</p>
    </fieldset>
    <fieldset class="field-group">
      <legend>Accent colours</legend>
      <div class="choices">
        ${radio('accent', 'lavender', '<span class="swatch sw-lavender" aria-hidden="true"></span>Lavender &amp; plum', p.accent)}
        ${radio('accent', 'sage', '<span class="swatch sw-sage" aria-hidden="true"></span>Sage &amp; ink', p.accent)}
        ${radio('accent', 'rose', '<span class="swatch sw-rose" aria-hidden="true"></span>Rose &amp; burgundy', p.accent)}
      </div>
    </fieldset>
    <fieldset class="field-group">
      <legend>Background</legend>
      <div class="choices">${radio('texture', 'on', 'Subtle paper texture', p.texture ? 'on' : 'off')}${radio('texture', 'off', 'Plain', p.texture ? 'on' : 'off')}</div>
    </fieldset>
    <fieldset class="field-group">
      <legend>Motion</legend>
      <div class="choices">${radio('motion', 'system', 'Match my device', p.motion)}${radio('motion', 'reduce', 'Reduce motion', p.motion)}${radio('motion', 'full', 'Allow gentle motion', p.motion)}</div>
    </fieldset>
    <fieldset class="field-group">
      <legend>Saving</legend>
      <label class="switch-row"><input type="checkbox" name="save" ${p.save ? 'checked' : ''}>
        <span><strong>Remember my plan and morning notes on this device</strong><br>
        <span class="hint">Off by default. When on, your settings, tasks, commitments, morning check-ins and any summaries you choose to keep are stored in this browser only. Anyone who uses this device and browser could see them. Private writing and AI conversations are never saved.</span></span>
      </label>
    </fieldset>
  </form>

  <section class="danger-zone paper-sheet" aria-labelledby="dz-h">
    <h2 id="dz-h">Delete and reset</h2>
    <p>Delete everything Rewrite Tomorrow has stored on this device and clear what’s on screen. This can’t be undone.</p>
    <button type="button" class="btn btn-danger" id="delete-all">Delete everything</button>
  </section>`;

  const form = $('#settings-form', el);
  form.addEventListener('change', async (e) => {
    const t = e.target;
    if (t.name === 'theme' || t.name === 'accent' || t.name === 'motion') setPref(t.name, t.value);
    if (t.name === 'texture') setPref('texture', t.value === 'on');
    if (t.name === 'save') {
      if (t.checked) {
        const ok = await confirmDialog({
          title: 'Save on this device?',
          message: 'Your plan and morning notes will be kept in this browser until you delete them. If you share this device, other people using it could see them. You can turn this off or delete everything at any time.',
          confirm: 'Yes, remember them',
          cancel: 'Not now',
        });
        if (!ok) { t.checked = false; return; }
        setPref('save', true);
        toast('Saving is on. Your plan is stored on this device only.');
      } else {
        setPref('save', false);
        toast('Saving is off. Saved plan data was removed from this device.');
      }
    }
  });
  $('#delete-all', el).addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Delete everything?',
      message: 'This removes your plan, commitments, tasks, morning notes, kept summaries and settings from this device, and clears tonight’s decisions.',
      confirm: 'Delete everything',
      danger: true,
    });
    if (ok) {
      deleteEverything();
      toast('Everything has been deleted from this device.');
    }
  });
}

// ------------------------------------------------------------ privacy
function renderPrivacy(el) {
  el.innerHTML = `
  <article class="prose-page paper-sheet">
    <p class="kicker evidence-label">Privacy &amp; your data</p>
    <h1>What happens to what you type</h1>
    <h2>Without an account</h2>
    <p>You never need an account. There are no analytics, no advertising trackers and no notifications. The fonts are loaded from Google Fonts, which receives an ordinary web request (like any website visit) but none of your content.</p>
    <h2>Your plan, check-ins and morning notes</h2>
    <p>These stay in this browser’s memory and disappear when you close or reload the page — unless you turn on <a href="#preferences">“Remember on this device”</a>. Then they are stored in this browser’s local storage, on this device only. They are never sent to our server.</p>
    <p>Appearance settings (theme, colours, texture, motion) are always remembered on this device so the page looks right next time.</p>
    <h2>“Put it down for tonight”</h2>
    <p>Private writing stays on your screen. It is never saved, never sent anywhere and never added to your calendar or exports. Closing the card clears it.</p>
    <h2>Untangle (AI reflection)</h2>
    <ul>
      <li><strong>If you choose AI reflection:</strong> each message you send leaves your device. It goes to this website’s server and is passed to <strong>Anthropic’s Claude API</strong> to write a reply. Our server doesn’t store or log what you write. Anthropic processes and may retain API data under its own commercial terms and privacy policy, so please avoid names, addresses or other identifying details.</li>
      <li><strong>If you choose guided reflection:</strong> nothing leaves your device. The replies are pre-written prompts, not AI.</li>
      <li>Conversations are not saved. They are cleared when you press “I’m done for tonight”, leave the page or reload.</li>
      <li>You can choose to keep a short summary. It’s only stored if saving is turned on, and you can delete it any time from the Untangle page or with “Delete everything”.</li>
    </ul>
    <h2>Calendar export</h2>
    <p>The .ics file only contains study sessions and (if you choose) wind-down reminders from your approved plan. It never includes reflections, check-ins or private writing.</p>
    <h2>Deleting</h2>
    <p>Use <a href="#preferences">Settings → Delete everything</a> to clear all stored data from this device at once.</p>
    <h2>Limits</h2>
    <p>No online service can promise absolute confidentiality. If something is serious or urgent, please talk to a trusted adult — see <a href="#support">Getting support</a>.</p>
  </article>`;
}

// ------------------------------------------------------------ support
function renderSupport(el) {
  el.innerHTML = `
  <article class="prose-page">
    <p class="kicker evidence-label">Getting support</p>
    <h1>When it’s more than a busy week</h1>
    <p class="lede">Some things need a person, not a planner.</p>
    ${supportBlock()}
    <section class="paper-sheet prose-section">
      <h2>If sleep has been hard for a while</h2>
      <p>If you’ve found it hard to sleep most nights for weeks, or tiredness is making daytime really difficult, it’s worth talking to a parent or carer and a doctor, or your school nurse or counsellor. Ongoing sleep problems are common, and they are not your fault. There are proven treatments that qualified professionals provide. This website isn’t one of them.</p>
    </section>
  </article>`;
}

function renderAbout(el) {
  el.innerHTML = `
  <article class="prose-page paper-sheet">
    <p class="kicker evidence-label">About this project</p>
    <h1>From the case book to the bedside table</h1>
    <p>Rewrite Tomorrow is the practical solution for our Grade 12 Gulf Medical University competition project, <strong>“Stolen: Tomorrow” — the role of sleep in brain health and academic performance</strong>. Our physical project is a giant handmade crime-investigation book with a paper-collage brain, research evidence, case reports and red thread.</p>
    <p>The investigation asked what insufficient sleep takes from students. This site asks the next question: <em>now that we understand the problem, what can we actually do?</em></p>
    <h2>What it is — and isn’t</h2>
    <ul>
      <li>It is a planning and wind-down tool built on low-risk, everyday strategies: realistic planning, small chosen actions, writing worries down, consistent routines, gentle breathing and talking to trusted people.</li>
      <li>It isn’t medical care, therapy or CBT-I, and it doesn’t diagnose anything. We haven’t tested whether it improves sleep, mood or grades — that would need a proper study.</li>
      <li>We’re evaluating it for usability and acceptability: can students make a realistic plan, understand the suggestions, finish something useful quickly, feel supported rather than judged, and stop comfortably?</li>
    </ul>
    <p><a href="#evidence">See the evidence room →</a></p>
  </article>`;
}

function renderNotFound(el) {
  el.innerHTML = `<div class="page-head"><h1>This page isn’t here</h1><p><a href="#home">Go back to the start</a></p></div>`;
}

// ------------------------------------------------------------ boot
applyPrefs();
persist();
route();
