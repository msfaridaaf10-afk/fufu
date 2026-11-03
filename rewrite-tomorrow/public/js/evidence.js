// The Evidence Room — five case-file cards, each separating what research says
// from the design choices we made because of it.
import { esc } from './ui.js';

const NHLBI_EFFECTS = 'https://www.nhlbi.nih.gov/health/sleep-deprivation/health-effects';
const NHLBI_CLOCK = 'https://www.nhlbi.nih.gov/health/sleep-deprivation/body-clock';
const CDC = 'https://www.cdc.gov/sleep/about/';
const AASM = 'https://jcsm.aasm.org/doi/10.5664/jcsm.5866';
const CBTI = 'https://pubmed.ncbi.nlm.nih.gov/39680961/';
const UNICEF = 'https://www.unicef.org/innocenti/reports/policy-guidance-ai-children';

const CARDS = [
  {
    n: '01', title: 'Sleep and memory', tilt: -1.2,
    finding: 'While you sleep, your brain is busy preparing for the next day — including forming and strengthening the pathways that help you learn and remember.',
    implication: 'Staying up later to cram can cost some of the time your brain uses to hold on to what you studied.',
    design: 'The planner reserves your sleep opportunity before placing any study, and spreads big tasks across several days instead of one late night.',
    sources: [['NIH / NHLBI: How sleep affects your health', NHLBI_EFFECTS]],
  },
  {
    n: '02', title: 'Sleep and attention', tilt: 0.8,
    finding: 'Not getting enough sleep is linked with more trouble paying attention, making decisions and solving problems. In children and teens, it can show up as difficulty concentrating.',
    implication: 'A tired hour of study may not get as much done as a rested one — so “just one more hour” isn’t always a good trade.',
    design: 'Study is planned in short sessions with breaks, with a daily limit you choose, rather than long unbroken stretches.',
    sources: [['NIH / NHLBI: How sleep affects your health', NHLBI_EFFECTS]],
  },
  {
    n: '03', title: 'Sleep and emotional regulation', tilt: -0.6,
    finding: 'Sleep deficiency is linked with more difficulty controlling emotions and behaviour, and with mood changes.',
    implication: 'Things can feel bigger and harder to handle late at night, especially when you’re tired. That isn’t a personal failing.',
    design: 'Night mode shows fewer choices, one decision at a time. Untangle and “Put it down” help you set worries aside — and point to real people when something is serious.',
    sources: [['NIH / NHLBI: How sleep affects your health', NHLBI_EFFECTS]],
  },
  {
    n: '04', title: 'The teenage body clock', tilt: 1.1,
    finding: 'During the teenage years, the body’s internal clock typically shifts later, so many teens naturally feel sleepy later at night — while school still starts early.',
    implication: 'Feeling wide awake at 23:00 is common for teenagers. You can’t simply force yourself to fall asleep, but a steady routine can help.',
    design: 'We never blame you for being awake. The planner uses a consistent wake-up time, protects a wind-down period, and treats “tired but not sleepy” with low-pressure options.',
    sources: [['NIH / NHLBI: Your sleep/wake cycle and the body clock', NHLBI_CLOCK]],
  },
  {
    n: '05', title: 'Sleep and academic performance', tilt: -0.9,
    finding: 'For ages 13–18, experts recommend 8–10 hours of sleep per 24 hours. Regularly getting the recommended amount is associated with better attention, learning, memory and emotional regulation.',
    implication: 'Sleep is one important influence on how school goes — alongside teaching, health, home life, stress and much more. It doesn’t decide your results on its own.',
    design: 'We show honest numbers about time — available study time, sleep opportunity, work remaining — and never predict grades or promise results.',
    sources: [['CDC: About sleep', CDC], ['American Academy of Sleep Medicine consensus on recommended sleep for children and teens (Paruthi et al., 2016)', AASM]],
  },
];

export function renderEvidence(el) {
  el.innerHTML = `
  <div class="evidence-room">
    <div class="page-head">
      <p class="kicker"><span class="evidence-label">Case 12</span> Stolen: Tomorrow</p>
      <h1>The Evidence Room</h1>
      <p class="lede">What our investigation found — and what we built because of it. Each file separates <strong>what research says</strong> from <strong>our design choices</strong>.</p>
    </div>
    <div class="board">
      <svg class="board-threads" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path d="M12 8 C 40 20, 60 2, 88 14" /><path d="M88 14 C 70 40, 30 38, 14 58" /><path d="M14 58 C 40 70, 64 56, 86 74" /><path d="M86 74 C 60 90, 40 84, 20 96" />
      </svg>
      <ol class="case-files" role="list">
        ${CARDS.map((c) => `
        <li class="case-file" style="--tilt:${c.tilt}deg">
          <article aria-labelledby="ev-${c.n}">
            <span class="pin" aria-hidden="true"></span>
            <p class="case-label"><span class="evidence-label">Exhibit ${c.n}</span></p>
            <h2 id="ev-${c.n}">${esc(c.title)}</h2>
            <div class="ev-block"><h3>Research says</h3><p>${esc(c.finding)}</p></div>
            <div class="ev-block"><h3>What it means</h3><p>${esc(c.implication)}</p></div>
            <div class="ev-block ev-design"><h3>Our design choice</h3><p>${esc(c.design)}</p></div>
            <p class="ev-source">Source: ${c.sources.map(([t, u]) => `<a href="${u}" target="_blank" rel="noopener">${esc(t)}<span class="visually-hidden"> (opens in a new tab)</span></a>`).join('; ')}</p>
          </article>
        </li>`).join('')}
        <li class="case-file case-note" style="--tilt:1.4deg">
          <article aria-labelledby="ev-status">
            <span class="pin" aria-hidden="true"></span>
            <p class="case-label"><span class="evidence-label">Case status</span></p>
            <h2 id="ev-status">Open. Next step: tonight.</h2>
            <p>The investigation showed what short sleep can take. This site is about taking a little of it back — one small step at a time.</p>
            <a class="btn btn-primary" href="#/checkin">What’s keeping me up?</a>
          </article>
        </li>
      </ol>
    </div>

    <section class="paper-sheet ev-notes" aria-labelledby="ev-notes-h">
      <h2 id="ev-notes-h">Reading the evidence carefully</h2>
      <ul>
        <li><strong>“Stolen: Tomorrow” is a metaphor.</strong> A short night doesn’t cause permanent brain damage. The point is that sleep loss can take something from the next day — focus, memory, patience — and good sleep helps give it back.</li>
        <li><strong>Treatment is different from this website.</strong> Research reviews suggest cognitive behavioural therapy for insomnia (CBT-I), delivered by trained professionals, can help adolescents with insomnia (<a href="${CBTI}" target="_blank" rel="noopener">a systematic review and meta-analysis of trials</a>). Rewrite Tomorrow doesn’t provide CBT-I, and that research doesn’t show that this website works.</li>
        <li><strong>AI with young people.</strong> Our Untangle design follows ideas from <a href="${UNICEF}" target="_blank" rel="noopener">UNICEF’s policy guidance on AI and children</a>: be transparent that it’s AI, protect privacy, avoid manipulation and dependence, and point to human support.</li>
        <li><strong>What we can honestly claim.</strong> We’ve tested whether students can use it — not whether it changes sleep, wellbeing or grades. That would need a proper study.</li>
      </ul>
    </section>
  </div>`;
}
