import { SUPPORT } from './safety.js';
import { esc } from './ui.js';

export function supportBlock({ compact = false } = {}) {
  const items = SUPPORT.uae.map((s) => `<li><a class="phone" href="tel:${s.number}">${esc(s.number)}</a> <span>${esc(s.label)}</span></li>`).join('');
  return `
  <div class="support-card${compact ? ' compact' : ''}" role="region" aria-label="Support from real people">
    <h2 class="support-title">You deserve support from a real person.</h2>
    <p>If you’re in danger or might hurt yourself, please contact someone now. Rewrite Tomorrow can’t contact anyone, check on you, or send help.</p>
    <h3>If you are in the UAE</h3>
    <ul class="support-list">${items}</ul>
    <h3>Anywhere else</h3>
    <p>Call your local emergency number.</p>
    <h3>People you could tell</h3>
    <p>A parent or carer, another family member, a school counsellor, school nurse or a teacher you trust. You could start with: “Can I talk to you about something that’s been worrying me?”</p>
    <p class="hint">UAE numbers checked in ${esc(SUPPORT.verified)} using the <a href="${SUPPORT.sourceUrl}" rel="noopener" target="_blank">UAE government portal</a> and its <a href="${SUPPORT.childSourceUrl}" rel="noopener" target="_blank">child-protection page</a>.</p>
  </div>`;
}

