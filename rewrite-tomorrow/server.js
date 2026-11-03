// Rewrite Tomorrow — small Node server.
// Serves the static site and one AI endpoint. The Anthropic API key stays on the
// server (environment variable ANTHROPIC_API_KEY) and is never sent to the browser.
//
// Privacy: message text is never written to logs, disk or analytics. Requests are
// forwarded to the Anthropic API and the reply is returned; nothing is kept here.

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { needsSupport } from './public/js/safety.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, 'public');
const PORT = Number(process.env.PORT) || 8080;
const MODEL = process.env.REWRITE_MODEL || 'claude-opus-5-5';
const HAS_KEY = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
const AI_DISABLED = process.env.REWRITE_DISABLE_AI === '1';

const client = HAS_KEY && !AI_DISABLED ? new Anthropic({ timeout: 30_000, maxRetries: 1 }) : null;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    "style-src-attr 'unsafe-inline'", // calendar block positions
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

// ---------------------------------------------------------------- AI prompt
const SYSTEM_PROMPT = `You are "Untangle", an AI reflection and planning tool inside Rewrite Tomorrow, a website that helps students aged 13–18 settle at night and plan schoolwork while protecting time for sleep. You are an AI tool. You are not a therapist, counsellor, friend, doctor, diagnostic service or emergency service, and you never pretend otherwise.

How to reply:
- Keep every reply short: 1–3 sentences, under 70 words, plain simple English. No lists unless the student asks.
- Acknowledge feelings without exaggerating them. Do not catastrophise or over-praise.
- Ask at most ONE focused question per reply, and offer choices rather than commands ("Would it help to…", "You could…, or…").
- Never diagnose, never name conditions, never claim to know why someone can't sleep. Do not suggest medication, supplements, sleep restriction or any treatment.
- Don't pressure the student to share details. Make it clear they can skip or stop.
- Gently question unrealistic or harmful beliefs (for example "I have to finish everything tonight or I'll fail") instead of agreeing with them. Separate what must happen tomorrow from what can wait.
- Encourage real people: a parent or carer, a teacher, a school counsellor or nurse, a friend. Suggest a qualified professional or trusted adult if sleep problems seem persistent or are affecting daytime life a lot.
- Never use romantic, exclusive or dependent language. Never say you miss, need or care about the student more than others do, or understand them better than people in their life. No pet names. No emojis.
- Don't promise sleep, better grades, or that anything will definitely work.
- It's late at night for many users. Support stopping: it's fine to end the conversation; don't add hooks to keep them chatting.
- Do not create or change calendar items yourself. If a plan would help, suggest it and say the student can use "Make a plan" to review a change before anything is applied.

Safety: if the student mentions wanting to die, self-harm, being hurt or abused, being in danger, or not being safe at home, stop all study or productivity coaching. Respond warmly and briefly, say they deserve support from a real person now, encourage them to contact a trusted adult, and if they are in immediate danger, to call local emergency services (in the UAE: 999 police, 998 ambulance; child protection 116111). Be honest that you cannot contact anyone, monitor them, or check on them. Don't ask for details of what happened.

The student may pick a focus:
- "explain": help them put what's on their mind into words.
- "step": help them find one small, realistic next step (or decide it can wait).
- "plan": help them separate tonight / tomorrow / can wait, so they can then use the planner.`;

const SUMMARY_PROMPT = `${SYSTEM_PROMPT}

Now write a short summary of this conversation for the student, in their own terms, as JSON with exactly these string fields:
"onMind": what is on their mind (max 25 words),
"oneThing": one small thing they could do, or "Nothing tonight — that's okay." (max 25 words),
"canWait": what can wait until later (max 25 words).
Write in second person ("You…"). No diagnosis, no promises. Output only the JSON object.`;

const SUPPORT_NOTE = 'The latest message may involve danger, self-harm or abuse. Follow the Safety instructions now. Do not do any study planning in this reply.';

// ---------------------------------------------------------------- helpers
const buckets = new Map(); // ip -> { count, reset }
function rateLimited(ip) {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || b.reset < now) {
    buckets.set(ip, { count: 1, reset: now + 10 * 60_000 });
    return false;
  }
  b.count += 1;
  return b.count > 40;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
}, 60_000).unref();

function send(res, status, body, headers = {}) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    ...(isObj ? { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } : {}),
    ...headers,
  });
  res.end(isObj ? JSON.stringify(body) : body);
}

function readBody(req, limit = 32_000) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function validMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 30) return false;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!m || typeof m.content !== 'string') return false;
    if (m.role !== (i % 2 === 0 ? 'user' : 'assistant')) return false;
    if (m.content.length === 0 || m.content.length > 2000) return false;
  }
  return messages[messages.length - 1].role === 'user';
}

function textOf(response) {
  return response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

async function callClaude({ system, messages, maxTokens }) {
  const params = {
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages,
    output_config: { effort: 'low' },
  };
  try {
    // Server-side fallback: if the primary model declines, the API retries on a
    // recommended fallback model inside the same call.
    return await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
  } catch (err) {
    if (err instanceof Anthropic.BadRequestError) {
      // Fallback parameter not accepted for this account/model — retry plainly.
      return client.messages.create(params);
    }
    throw err;
  }
}

async function handleUntangle(req, res) {
  if (!client) return send(res, 503, { error: 'not_configured' });
  const ip = req.socket.remoteAddress || 'unknown';
  if (rateLimited(ip)) return send(res, 429, { error: 'rate_limited' });

  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch (err) {
    return send(res, err.status || 400, { error: 'bad_request' });
  }
  const { messages, mode = 'reply', focus } = payload || {};
  if (!validMessages(messages)) return send(res, 400, { error: 'bad_request' });

  const support = messages.some((m) => m.role === 'user' && needsSupport(m.content));
  const focusNote = ['explain', 'step', 'plan'].includes(focus) ? `The student chose the focus "${focus}".` : '';

  const extra = [focusNote, support ? SUPPORT_NOTE : ''].filter(Boolean).join(' ');
  const convo = messages.map((m) => ({ role: m.role, content: m.content }));
  const withExtra = (base) => (extra ? `${base}\n\n${extra}` : base);

  try {
    if (mode === 'summary') {
      const r = await callClaude({ system: withExtra(SUMMARY_PROMPT), messages: convo, maxTokens: 1200 });
      if (r.stop_reason === 'refusal') return send(res, 200, { refused: true });
      const raw = textOf(r);
      const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
      let summary;
      try {
        summary = JSON.parse(json);
      } catch {
        return send(res, 502, { error: 'bad_summary' });
      }
      const clean = (v) => (typeof v === 'string' ? v.slice(0, 300) : '');
      return send(res, 200, { summary: { onMind: clean(summary.onMind), oneThing: clean(summary.oneThing), canWait: clean(summary.canWait) }, support });
    }
    const r = await callClaude({ system: withExtra(SYSTEM_PROMPT), messages: convo, maxTokens: 1500 });
    if (r.stop_reason === 'refusal') return send(res, 200, { refused: true, support });
    const reply = textOf(r);
    if (!reply) return send(res, 502, { error: 'empty' });
    return send(res, 200, { reply: reply.slice(0, 1200), support });
  } catch (err) {
    // Log only the error type and status — never message content.
    const status = err && err.status ? err.status : 'network';
    console.error(`[untangle] upstream error: ${err && err.name} ${status}`);
    if (err instanceof Anthropic.RateLimitError) return send(res, 503, { error: 'busy' });
    if (err instanceof Anthropic.AuthenticationError) return send(res, 503, { error: 'not_configured' });
    return send(res, 502, { error: 'unavailable' });
  }
}

async function serveStatic(req, res) {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    return send(res, 400, 'Bad request');
  }
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.normalize(path.join(PUBLIC, urlPath));
  if (!filePath.startsWith(PUBLIC + path.sep)) return send(res, 403, 'Forbidden');
  try {
    const st = await stat(filePath);
    if (!st.isFile()) throw new Error('not file');
    const data = await readFile(filePath);
    const ext = path.extname(filePath);
    send(res, 200, data, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
    });
  } catch {
    // Single-page app: unknown paths get the shell (hash routing does the rest).
    if (!path.extname(urlPath)) {
      const data = await readFile(path.join(PUBLIC, 'index.html'));
      return send(res, 200, data, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
    }
    send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://x');
    if (pathname === '/api/status' && req.method === 'GET') {
      return send(res, 200, { ai: Boolean(client), provider: client ? 'Anthropic (Claude API)' : null });
    }
    if (pathname === '/api/untangle') {
      if (req.method !== 'POST') return send(res, 405, { error: 'method' });
      return handleUntangle(req, res);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    return serveStatic(req, res);
  } catch {
    send(res, 500, { error: 'server' });
  }
});

server.listen(PORT, () => {
  console.log(`Rewrite Tomorrow running at http://localhost:${PORT}`);
  console.log(client ? `Untangle AI: enabled (${MODEL})` : 'Untangle AI: not configured — guided reflection will be used.');
});
