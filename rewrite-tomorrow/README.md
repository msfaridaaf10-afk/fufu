# Rewrite Tomorrow

**“Give tomorrow a better beginning.”**

The practical solution for our Grade 12 Gulf Medical University competition project, **“Stolen: Tomorrow” — the role of sleep in brain health and academic performance**. The physical project is a handmade crime-investigation book. This website answers the next question: *now that we understand the problem, what can we actually do?*

It helps students aged 13–18 notice what's keeping them up, pick one manageable next step, and plan schoolwork **around** protected sleep, not on top of it. It is built to give you a clear stopping point, not to keep you scrolling.

> Rewrite Tomorrow is an educational planning and wind-down tool. It isn't medical care, therapy or CBT-I, and it doesn't diagnose anything. We haven't studied whether it improves sleep, wellbeing or grades.

## Run it

```bash
cd rewrite-tomorrow
npm install
npm start            # http://localhost:8080
```

You need Node 20 or newer. With no further setup, everything works and Untangle uses **guided reflection**: pre-written prompts that run on the device and are labelled as not AI.

### Turn on AI reflection (optional)

Set an Anthropic API key **on the server**:

```bash
ANTHROPIC_API_KEY=sk-ant-... npm start
```

- The key is only read by `server.js`. The browser never sees it.
- The default model is `claude-opus-5-5`. Override it with `REWRITE_MODEL`.
- `REWRITE_DISABLE_AI=1` forces guided reflection even when a key is set.
- The server does not log or store message content. It logs only error types and status codes.

If the key is missing or wrong, or the service can't be reached, the page says so and offers guided reflection. Scripted replies are never presented as AI.

### Tests

```bash
npm test                         # scheduler logic + colour contrast (node:test)
npm start &                      # then, with Playwright available:
node test/e2e.mjs http://localhost:8080/
```

`test/e2e.mjs` runs 64 browser checks. They cover:

- an overloaded evening
- a deadline before the next free slot
- sleep that crosses midnight
- conflicting commitments
- skipping the check-in
- AI unavailable, and network failure
- rejecting, approving and undoing a rewrite
- moving a session without dragging
- `.ics` export contents
- deleting all data
- private writing never being stored
- sensitive disclosures showing support
- mouse dragging onto open time and onto protected sleep
- one-off commitments
- night mode showing fewer elements
- reduced motion
- phone layout and touch-target size
- keyboard navigation

## What's inside

| Area | Where | What it does |
| --- | --- | --- |
| Home | `js/app.js`, `js/brain.js` | Paper-collage brain; three entry cards light up matching fragments; “Explore a sample day” |
| What's keeping me up? | `js/checkin.js` | Multi-select, at most two follow-ups, editable suggestions routed by reason |
| Untangle | `js/untangle.js`, `server.js` | AI or guided reflection, privacy notice first, summary, task only with permission, “I'm done for tonight” |
| Put it down for tonight | `js/putdown.js` | Three optional prompts on a paper card; drag **or** buttons; never saved |
| Planner | `js/planner.js`, `js/scheduler.js` | Sleep and commitments (weekly or one-off) reserved first; sessions, breaks, daily cap, buffers; conflicts; unscheduled work with 4 options; move by dialog or mouse drag, with undo; week + agenda; `.ics` export |
| Rewrite this evening | `js/rewrite.js`, `proposeRewrite()` | “My current plan” vs “A possible rewrite”, built from the real scheduler; explains every move; approve or keep; Undo |
| Close the day | `js/close.js` | Decided / can wait / “You can stop here”; comfortable breathing (no holds); grounding; printable card |
| Morning check-in | `js/morning.js` | Four skippable questions; descriptive observations only after 5 entries |
| Evidence Room | `js/evidence.js` | Five case files: research finding, what it means, *our design choice*, source |
| Settings and privacy | `js/app.js`, `js/store.js` | Light/dark/system, 3 palettes, texture, motion, opt-in saving, delete everything |
| Night mode | `css/app.css`, `js/app.js` | Dark surfaces, fewer elements on the home page (with “Show everything”), no lifting or tilting cards |

### Scheduling rules (`public/js/scheduler.js`)

1. The protected sleep opportunity, wind-down and getting-ready time are reserved first.
2. School, travel and fixed commitments are reserved next, with a buffer after each one.
3. Study goes into 5-minute slots that are still free. Tasks are placed earliest deadline first, in sessions with breaks and under a daily cap. Work you planned for tonight gets first claim on tonight only.
4. Sleep is never shortened and nothing overlaps to make work fit. Leftover work stays visible, with the reason: *not enough time*, *due before your next free slot*, or *deadline passed*.
5. Times are absolute minutes from the plan's first day, so overnight blocks need no special handling. Day arithmetic uses UTC dates, so daylight-saving changes don't shift days. The `.ics` export converts local times to UTC.

## Privacy, as implemented

- No account, analytics or notifications. Fonts load from Google Fonts.
- Plans, check-ins and morning notes stay in memory unless the student turns on **Remember on this device**. That stores them in `localStorage` after a warning about shared devices.
- Appearance settings are always remembered on the device.
- Private writing and AI conversations are never stored. Only a summary the student chooses to keep is saved, and only when saving is on.
- The calendar export contains study sessions only, plus wind-down reminders if the student picks them.
- Sample-day data is separate and never saved.

## Support resources

The UAE numbers were checked in November 2026 on the UAE government portal (u.ae):

- 999 Police
- 998 Ambulance
- 116111 Ministry of Interior Child Protection Centre

Elsewhere, the site says to call the local emergency number. Check these numbers again before deploying in another country.

## Sources used

- NIH/NHLBI — [Your sleep/wake cycle and the body clock](https://www.nhlbi.nih.gov/health/sleep-deprivation/body-clock)
- NIH/NHLBI — [How sleep affects your health](https://www.nhlbi.nih.gov/health/sleep-deprivation/health-effects)
- CDC — [About sleep](https://www.cdc.gov/sleep/about/)
- AASM consensus — [Recommended amount of sleep for pediatric populations](https://jcsm.aasm.org/doi/10.5664/jcsm.5866)
- [CBT-I in adolescents: systematic review and meta-analysis](https://pubmed.ncbi.nlm.nih.gov/39680961/). Cited only to separate professional treatment from this tool.
- UNICEF — [Policy guidance on AI and children](https://www.unicef.org/innocenti/reports/policy-guidance-ai-children)

## Evaluating the prototype

We evaluate usability and acceptability, not outcomes:

- Can students make a realistic plan?
- Do they understand the suggestions?
- Can they do something useful quickly?
- Do they feel supported rather than judged?
- Can they stop comfortably?

## Limitations

- Without a server, for example opened as a file or on static hosting, the site needs any static server that serves `public/`. AI reflection then stays off and guided reflection is used.
- The plan covers the next 7 days from today.
- Dragging calendar sessions works with a mouse or pen. On touch screens a tap opens the move dialog, so the page still scrolls normally.
- Crisis detection uses keyword matching and can miss things. The support page is always one click away in the footer.
