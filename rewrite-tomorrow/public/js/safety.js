// Shared by the browser and the server. Detects messages that may involve immediate
// danger, self-harm or abuse so the experience can switch from planning to support.
// Deliberately cautious: a false positive shows a kind support card; a miss is worse.

const PATTERNS = [
  /\b(kill|hurt|harm|cut|cutting|burn)\s+(my\s?self|myself)\b/i,
  /\bself[-\s]?harm/i,
  /\bsuicid/i,
  /\b(end|take)\s+my\s+(own\s+)?life\b/i,
  /\bwant\s+to\s+die\b/i,
  /\b(wish|want)\s+i\s+(was|were)\s+(dead|gone|never\s+born)\b/i,
  /\bbetter\s+off\s+(dead|without\s+me)\b/i,
  /\bno\s+(reason|point)\s+(to|in)\s+(live|living|be\s+alive)\b/i,
  /\bdon'?t\s+want\s+to\s+(be\s+alive|live|wake\s+up)\b/i,
  /\boverdos/i,
  /\b(abus(e|ed|ing|ive))\b/i,
  /\b(hits?|hitting|beats?|beating|hurts?)\s+me\b/i,
  /\b(touch(ed|es|ing)?\s+me)\b.*\b(without|don'?t|didn'?t|not)\b/i,
  /\b(rape|raped|molest)/i,
  /\bnot\s+safe\s+(at\s+home|here|right\s+now)\b/i,
  /\b(scared|afraid)\s+to\s+go\s+home\b/i,
  /\bsomeone\s+is\s+(threatening|hurting)\b/i,
  /\bin\s+danger\b/i,
];

export function needsSupport(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.replace(/[’]/g, "'");
  return PATTERNS.some((p) => p.test(t));
}

// Verified in November 2026 against the UAE Government portal (u.ae):
//  - "Handling emergencies": 999 police, 998 ambulance.
//  - "Report child abuse": Ministry of Interior Child Protection Centre, 116111.
// Check these again before any public deployment outside the competition.
export const SUPPORT = {
  uae: [
    { label: 'Police (emergency)', number: '999' },
    { label: 'Ambulance', number: '998' },
    { label: 'Child Protection Centre, Ministry of Interior (to report abuse or harm to a child)', number: '116111' },
  ],
  sourceUrl: 'https://u.ae/en/information-and-services/justice-safety-and-the-law/handling-emergencies',
  childSourceUrl: 'https://u.ae/en/information-and-services/justice-safety-and-the-law/children-safety/report-child-abuse',
  verified: 'November 2026',
};
