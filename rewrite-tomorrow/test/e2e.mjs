// End-to-end checks in a real browser. Start the server first (npm start), then:
//   node test/e2e.mjs [baseUrl] [screenshotDir]
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('playwright')); }

const BASE = process.argv[2] || 'http://localhost:8080/';
const SHOTS = process.argv[3] || null;
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`); };

const browser = await chromium.launch();
const errors = [];
async function newPage(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...opts });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|net::ERR_FAILED/.test(m.text())) errors.push(m.text()); });
  return { ctx, page };
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); };

// 1. Check-in: skip emotional questions, multi-select, max two follow-ups
{
  const { ctx, page } = await newPage();
  await page.goto(`${BASE}#/checkin`);
  await page.getByLabel('I would rather skip this.').check();
  await page.getByRole('button', { name: 'Continue' }).click();
  check('Skipping the check-in goes straight to gentle options', await page.getByRole('heading', { name: 'That’s okay.' }).isVisible());

  await page.getByRole('button', { name: 'Start the check-in again' }).click();
  for (const o of ['I have too much work.', 'I keep scrolling.', 'My thoughts won’t slow down.', 'My surroundings make sleep difficult.']) await page.getByLabel(o).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  let followups = 0;
  while (await page.locator('#fu-form').count()) {
    followups += 1;
    await page.getByRole('button', { name: 'You can skip this' }).click();
  }
  check('At most two follow-up questions', followups === 2, `${followups} asked`);
  const recs = await page.locator('.rec').count();
  check('Recommendations shown for each selected reason', recs >= 4, `${recs} cards`);
  await page.locator('.rec').filter({ hasText: 'Your stopping plan' }).locator('textarea').fill('At 22:00 my phone charges in the kitchen.');
  await page.getByRole('button', { name: 'Use this plan' }).click();
  await page.goto(`${BASE}#/close`);
  check('Edited recommendation lands on the Close-the-day card', await page.locator('.day-list').getByText('At 22:00 my phone charges in the kitchen.').isVisible());
  await ctx.close();
}

// 2. Untangle with unavailable AI → honest guided fallback; sensitive disclosure → support
{
  const { ctx, page } = await newPage();
  await page.route('**/api/status', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ai":false}' }));
  await page.goto(`${BASE}#/untangle`);
  await page.waitForSelector('.gate');
  check('AI unavailable is explained before starting', await page.getByText('AI reflection isn’t set up on this website.').isVisible());
  await page.getByRole('button', { name: 'Use guided reflection' }).click();
  check('Guided mode is clearly labelled as not AI', await page.getByText('Guided reflection · pre-written prompts, not AI').isVisible());
  await page.getByRole('button', { name: 'Help me find a small next step' }).click();
  const input = page.getByLabel('Your message');
  await input.fill('I still have so much biology and I feel guilty sleeping.');
  await page.getByRole('button', { name: 'Send' }).click();
  check('Guided reply acknowledges without exaggerating', await page.getByText('It sounds like stopping feels risky when there’s still work left.').isVisible());
  for (const m of ['Maybe make flashcards for chapter 3', 'Make 10 flashcards', 'Tomorrow after school; the rest can wait']) { await input.fill(m); await page.getByRole('button', { name: 'Send' }).click(); }
  await page.getByRole('button', { name: 'Yes, summarise' }).click();
  check('Summary offered and shown', await page.getByText('Summary · you can edit this').isVisible());
  await page.getByRole('button', { name: 'Turn “one thing” into a task?' }).click();
  check('Asks permission before adding a task', await page.getByRole('heading', { name: 'Add this to your plan?' }).isVisible());
  await page.getByRole('button', { name: 'Don’t add' }).click();
  await shot(page, 'untangle-guided');
  await input.fill('honestly sometimes I want to die');
  await page.getByRole('button', { name: 'Send' }).click();
  check('Sensitive disclosure shows real-world support', await page.locator('.support-card').isVisible());
  check('Productivity coaching paused after disclosure', await page.locator('#act-plan').isHidden());
  check('UAE emergency numbers shown', (await page.locator('.support-card').innerText()).includes('999'));
  await page.getByRole('button', { name: /Stop · I’m done for tonight/ }).click();
  check('Stop clears the conversation', (await page.locator('.thread').count()) === 0 && await page.getByText('Okay. That’s enough for tonight.').isVisible());
  await ctx.close();
}

// 3. Untangle with AI configured but network failing
{
  const { ctx, page } = await newPage();
  await page.route('**/api/status', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ai":true}' }));
  await page.route('**/api/untangle', (r) => r.abort('failed'));
  await page.goto(`${BASE}#/untangle`);
  await page.getByRole('button', { name: 'Use AI reflection' }).click();
  check('AI mode says which service processes messages', await page.getByText('AI reflection · replies written by Claude (Anthropic)').isVisible());
  await page.getByLabel('Your message').fill('Too much homework');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.waitForSelector('[data-guided]');
  check('Network failure keeps the message and offers retry or guided mode', await page.getByText('Your message wasn’t lost').isVisible());
  await page.getByRole('button', { name: 'Switch to guided reflection' }).click();
  check('Switching to guided continues the conversation', await page.locator('.msg-assistant').count() === 1);
  await ctx.close();
}

// 4. Planner + rewrite: overloaded evening, approve, undo, reject, move session
{
  const { ctx, page } = await newPage();
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Explore a sample day' }).click();
  await page.waitForSelector('.panels');
  check('Sample day banner identifies fictional data', await page.getByText('Sample day.').isVisible());
  const cur = await page.locator('.panel-current').innerText();
  check('Current plan shows the overloaded evening honestly', /into your wind-down and sleep time/.test(cur));
  await page.locator('.pick-row').filter({ hasText: 'English essay draft' }).getByText('Ask for help or time').click();
  check('Changing a choice updates the proposal', await page.locator('.chg-help').count() > 0);
  await page.locator('.pick-row').filter({ hasText: 'English essay draft' }).getByText('Can move').click();
  await shot(page, 'rewrite-demo');
  await page.getByRole('button', { name: 'Keep my current plan' }).click();
  check('Rejecting the proposal changes nothing', await page.getByText('your plan stays as it is').isVisible());
  await page.locator('[data-sel]').first().check();
  await page.locator('[data-sel]').nth(1).check();
  await page.getByRole('button', { name: 'Use this rewrite' }).click();
  check('Approving applies the rewrite', await page.getByRole('heading', { name: 'Tonight is rewritten.' }).isVisible());
  await page.goto(`${BASE}#/plan`);
  const tasksAfter = await page.locator('.task-title').allInnerTexts();
  check('Rewrite split the essential part', tasksAfter.some((t) => t.includes('essential part')));
  await page.locator('#undo-btn').click();
  const tasksUndo = await page.locator('.task-title').allInnerTexts();
  check('Undo restores the previous plan', !tasksUndo.some((t) => t.includes('essential part')));
  // Move a session via accessible dialog (no dragging required)
  const first = page.locator('.blk-study').filter({ hasText: 'History' }).first();
  const before = await first.getAttribute('aria-label');
  await first.click();
  await page.locator('.slot input').nth(1).check();
  await page.getByRole('button', { name: 'Move session' }).click();
  check('Moving a session explains old and new time', await page.locator('#toast').getByText(/Moved “.*” from .* to/).isVisible());
  check('Old location is shown on the calendar', await page.locator('.ghost').count() === 1);
  check('Moved session marked as placed by you', await page.locator('.blk-study.is-pinned').count() >= 1, before);
  check('Conflicting commitments flagged beside the commitment', await page.locator('.task-attn').filter({ hasText: 'overlaps Maths tutoring' }).isVisible());
  check('Unscheduled work stays visible with options', await page.getByText('This plan needs more time than you have available.').isVisible() && await page.getByRole('button', { name: 'Plan to ask for help or an extension' }).first().isVisible());
  // Export only approved schedule items
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export study sessions (.ics)' }).click()]);
  const fs = await import('node:fs');
  const ics = fs.readFileSync(await dl.path(), 'utf8');
  check('Calendar export contains only study sessions', ics.includes('SUMMARY:Study:') && !/flashcards|guilty|die/i.test(ics));
  await page.getByRole('button', { name: 'Agenda' }).click();
  check('Agenda view lists the week', await page.locator('.agenda-day').count() === 7);
  await page.getByRole('button', { name: 'Leave sample day' }).click();
  check('Leaving the sample day returns to an empty personal plan', await page.getByText('No tasks yet.').isVisible());
  await ctx.close();
}

// 5. Personal plan: task validation, add/edit/delete, sleep crossing midnight, deadline before next slot
{
  const { ctx, page } = await newPage();
  await page.goto(`${BASE}#/plan`);
  await page.getByRole('button', { name: 'Add a task' }).click();
  await page.getByLabel('What is it?').fill('');
  await page.getByRole('button', { name: 'Add task' }).click();
  check('Invalid task shows a readable error', await page.getByText('Give the task a short name.').isVisible());
  await page.getByLabel('What is it?').fill('Physics problems');
  await page.getByLabel('Estimated time (minutes)').fill('90');
  await page.getByRole('button', { name: 'Add task' }).click();
  check('Task added', await page.locator('.task-title').filter({ hasText: 'Physics problems' }).isVisible());
  await page.getByRole('button', { name: 'Edit Physics problems' }).click();
  await page.getByLabel('What is it?').fill('Physics set 4');
  await page.getByRole('button', { name: 'Save changes' }).click();
  check('Task edited', await page.locator('.task-title').filter({ hasText: 'Physics set 4' }).isVisible());
  await page.getByRole('button', { name: 'Delete Physics set 4' }).click();
  check('Task deleted with undo offered', await page.locator('#toast').getByRole('button', { name: 'Undo' }).isVisible());
  await page.locator('#toast').getByRole('button', { name: 'Undo' }).click();
  check('Delete undone', await page.locator('.task-title').filter({ hasText: 'Physics set 4' }).isVisible());
  await page.getByLabel('Wake-up time').fill('09:00');
  await page.getByLabel('Wake-up time').dispatchEvent('change');
  await page.getByLabel('Sleep opportunity').selectOption('8');
  check('Sleep crossing midnight shown correctly', (await page.locator('.summary-meta').innerText()).includes('01:00 lights out'));
  await ctx.close();
}

// 6. Morning check-in, saving, delete everything
{
  const { ctx, page } = await newPage();
  await page.goto(`${BASE}#/settings`);
  await page.getByLabel(/Remember my plan and morning notes/).check();
  check('Turning on saving explains shared-device risk', await page.getByText('If you share this device').isVisible());
  await page.getByRole('button', { name: 'Yes, remember them' }).click();
  await page.goto(`${BASE}#/morning`);
  await page.getByRole('button', { name: 'Save this morning' }).click();
  check('Skipping every morning question is allowed', await page.getByText('Skipping is always okay').isVisible());
  for (let i = 0; i < 2; i++) {
    await page.getByLabel('7–8 h').check();
    await page.getByRole('button', { name: 'Save this morning' }).click();
  }
  check('No patterns invented from too little data', await page.getByText('After 5 mornings').isVisible());
  const stored = await page.evaluate(() => localStorage.getItem('rt:data:v1'));
  check('Morning entries saved only after opting in', !!stored && stored.includes('7-8'));
  await page.goto(`${BASE}#/settings`);
  await page.getByRole('button', { name: 'Delete everything' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete everything' }).click();
  await page.locator('#toast').getByText('Everything has been deleted').waitFor();
  const after = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('rt:')));
  check('Delete everything removes stored data', after.length === 0, after.join(',')); // prefs key rewritten with defaults is acceptable
  await ctx.close();
}

// 7. Put it down: no-write path, keyboard, nothing saved
{
  const { ctx, page } = await newPage();
  await page.goto(`${BASE}#/putdown`);
  await page.getByLabel('What is on my mind?').fill('Worried about the chemistry test');
  await page.keyboard.press('Tab');
  await page.getByRole('button', { name: 'Next' }).press('Enter');
  await page.getByRole('button', { name: 'Skip this question' }).click();
  await page.getByRole('button', { name: 'Put it on a card' }).click();
  check('Thought appears on a paper card', await page.locator('.thought-main').filter({ hasText: 'chemistry' }).isVisible());
  await page.getByRole('button', { name: /Leave it here for now/ }).click();
  await page.waitForSelector('text=Left here for now.');
  const ls = await page.evaluate(() => JSON.stringify(localStorage));
  check('Private writing is never stored', !ls.includes('chemistry'));
  await page.getByRole('button', { name: 'Write another' }).click();
  await page.getByRole('button', { name: 'I don’t want to write' }).click();
  check('“I don’t want to write” is a full path', await page.getByRole('heading', { name: 'That’s completely fine.' }).isVisible());
  await ctx.close();
}

// 8. Close the day, reduced motion, phone layout, keyboard focus
{
  const { ctx, page } = await newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', hasTouch: true, isMobile: true });
  await page.goto(`${BASE}#/close`);
  await page.getByRole('button', { name: '1 minute' }).click();
  const tr = await page.locator('#br-circle').evaluate((e) => getComputedStyle(e).transform);
  check('Breathing circle stays still with reduced motion', tr === 'none');
  await page.getByRole('button', { name: 'Stop' }).click();
  await page.getByRole('button', { name: 'I’m finished for tonight' }).click();
  check('Finishing shows the quiet stopping message', await page.getByRole('heading', { name: 'Put your screen down when you’re ready.' }).isVisible());
  for (const route of ['', 'checkin', 'untangle', 'plan', 'rewrite', 'close', 'morning', 'evidence', 'settings', 'privacy', 'support', 'about']) {
    await page.goto(`${BASE}#/${route}`);
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 1) check(`No horizontal scroll on phone: /${route}`, false, `${overflow}px`);
  }
  check('Phone layouts checked for horizontal scroll', true);
  await page.goto(`${BASE}#/plan`);
  check('Phone defaults to the agenda view', await page.getByRole('button', { name: 'Agenda' }).getAttribute('aria-pressed') === 'true');
  await page.getByRole('button', { name: 'Menu' }).click();
  check('Phone menu opens', await page.getByRole('link', { name: 'Evidence' }).isVisible());
  await page.keyboard.press('Escape');
  const small = await page.evaluate(() => [...document.querySelectorAll('main button, main a.btn, main label:has(input[type="checkbox"]), main label:has(input[type="radio"]), .site-header button')]
    .filter((e) => e.offsetParent && e.getBoundingClientRect().height < 38).map((e) => e.textContent.trim().slice(0, 30)));
  check('Touch targets are large enough', small.length === 0, small.join(' | '));
  await ctx.close();
}

// 9. Keyboard-only: home → check-in
{
  const { ctx, page } = await newPage();
  await page.goto(BASE);
  await page.keyboard.press('Tab');
  const skip = await page.evaluate(() => document.activeElement.textContent.trim());
  check('First Tab reaches “Skip to content”', skip === 'Skip to content');
  let found = false;
  for (let i = 0; i < 25 && !found; i++) {
    await page.keyboard.press('Tab');
    found = await page.evaluate(() => document.activeElement.textContent.trim() === 'What’s keeping me up?');
  }
  await page.keyboard.press('Enter');
  check('Keyboard reaches and opens the check-in', found && page.url().includes('#/checkin'));
  const focusVisible = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle !== 'none' || document.activeElement.tagName === 'H1');
  check('Focus moves to the new page heading', focusVisible);
  await ctx.close();
}

await browser.close();
if (errors.length) console.log('\nBrowser errors:\n' + errors.join('\n'));
check('No JavaScript errors', errors.length === 0);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
