const OLLAMA_ENDPOINT = 'http://127.0.0.1:11434/api/generate';
const OLLAMA_VERSION_ENDPOINT = 'http://127.0.0.1:11434/api/version';
const FALLBACK_MODEL = 'mistral:7b-instruct';
const REQUEST_TIMEOUT_MS = 90000;

export async function classifyWithOllama(text) {
  const sanitized = sanitizeInput(text);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(OLLAMA_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        model: FALLBACK_MODEL,
        prompt: buildPrompt(sanitized),
        stream: false,
        options: {
          temperature: 0,
        },
      }),
      signal: controller.signal,
      credentials: 'omit',
    });

    if (!response.ok) {
      const text = await response.text();
      throw buildHttpError(response.status, text);
    }

    const payload = await response.json();
    const raw = payload?.response ?? payload;
    const parsed = parseModelResponse(raw);
    const normalized = normalizeModelOutput(parsed);
    return applySafetyOverrides(sanitized, normalized);
  } catch (error) {
    throw wrapClientError(error);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Lightweight health check for Ollama availability and CORS/origin allowance.
 * Returns { ok: true, version } on success; throws wrapped error otherwise.
 */
export async function checkOllamaStatus() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(REQUEST_TIMEOUT_MS, 5000));
  try {
    const response = await fetch(OLLAMA_VERSION_ENDPOINT, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      signal: controller.signal,
      credentials: 'omit',
    });
    if (!response.ok) {
      const text = await response.text();
      throw buildHttpError(response.status, text);
    }
    const payload = await response.json().catch(() => ({}));
    const version = payload?.version || payload?.build || 'unknown';
    return { ok: true, version };
  } catch (error) {
    throw wrapClientError(error);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Probe permissions by issuing a minimal /api/generate request.
 * Returns { ok: true } on success (even if model errors but not 403),
 * otherwise throws with wrapped error (including OLLAMA_FORBIDDEN on 403).
 */
export async function probeOllamaPermissions() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(REQUEST_TIMEOUT_MS, 5000));
  try {
    const response = await fetch(OLLAMA_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        model: FALLBACK_MODEL,
        prompt: 'ping',
        stream: false,
        options: { temperature: 0 }
      }),
      signal: controller.signal,
      credentials: 'omit',
    });
    if (!response.ok) {
      const text = await response.text();
      throw buildHttpError(response.status, text);
    }
    // We don't care about the content here, only that POST is allowed
    return { ok: true };
  } catch (error) {
    throw wrapClientError(error);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Generate a natural chat reply for the Chat Trainer using a local LLM via Ollama.
 * history: Array<{ sender: 'user'|'ai', text: string }>
 * options: { persona?: string, difficulty?: 'easy'|'medium'|'hard', mode?: 'learner'|'tutor' }
 */
export async function generateTrainerReply(history, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const { persona = 'FriendFun21', difficulty = 'medium', mode = 'learner' } = options;

  const prompt = buildTrainerPrompt(history || [], { persona, difficulty, mode });

  try {
    const response = await fetch(OLLAMA_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        model: FALLBACK_MODEL,
        prompt,
        stream: false,
        options: {
          temperature: 0.7,
          top_p: 0.9,
          repeat_penalty: 1.1,
          num_predict: 120,
        },
      }),
      signal: controller.signal,
      credentials: 'omit',
    });

    if (!response.ok) {
      const text = await response.text();
      throw buildHttpError(response.status, text);
    }

    const payload = await response.json();
    const raw = payload?.response ?? payload;
    let reply = postProcessTrainerText(String(raw || ''));
    if (looksMeta(reply)) {
      reply = friendlyFallback(history, { persona, difficulty });
    }
    return reply;
  } catch (error) {
    // Fallback to a safe, generic response if model is unavailable
    const reason = error?.message || 'Unknown error';
    return `Sorry, I lost my connection for a moment. Could you say that a different way? (${reason})`;
  } finally {
    clearTimeout(timeout);
  }
}

function buildPrompt(text) {
  return `You are Reveal, an educational safety assistant.
Analyze the following anonymized chat snippet for potential online grooming warning signs.
Respond only with minified JSON on a single line EXACTLY matching this schema:
{"status":"safe|warning|critical","summary":"...","evidence":["..."]}
- The "summary" must be under 240 characters and supportive for minors.
- Provide 1-3 evidence tips encouraging involvement of trusted adults.
- Do not include any extra commentary.
Snippet:
"""
${text}
"""
JSON=`;
}

function buildTrainerPrompt(history, { persona, difficulty, mode }) {
  const difficultyGuidance = {
    easy: 'keep things light and clearly safe; do NOT pressure for privacy; show early boundary respect.',
    medium: 'be friendly and curious; introduce mild pressure to switch platforms or keep small secrets without insisting; back off when the user sets boundaries.',
    hard: 'subtly increase pressure (still PG, non-explicit) to move platforms or share minor personal info; if the user declines, you should try once more then respect the boundary.',
  };

  const modeHint = mode === 'tutor'
    ? 'The user may be an educator. Keep the role-play realistic but non-graphic and suitable for teens. '
    : 'Assume the user is a teen learner. Keep content PG, supportive, and age-appropriate.';

  const transcript = history
    .map((m) => `${m.sender === 'user' ? 'You' : persona}: ${sanitizeString(m.text)}`)
    .join('\n');

  return `You are role-playing as "${persona}", a peer in a training simulation that helps people learn to spot online risks.
${modeHint}
Safety rules:
- Absolutely no explicit or sexual content, no age-inappropriate material.
- Keep responses short (1–2 sentences), natural, and conversational.
- Avoid real links/usernames; do not request contact details explicitly.
- You may gently suggest moving platforms or secrecy depending on difficulty, but never insist and always stay PG.
- Do not reveal you are an AI or that this is a simulation.

Difficulty: ${difficulty}. Guidance: ${difficultyGuidance[difficulty] || difficultyGuidance.medium}

Conversation so far:
${transcript || '(no messages yet)'}

Your next message as ${persona}, one or two sentences only:`;
}

function normalizeModelOutput(output) {
  const allowedStatuses = new Set(['safe', 'warning', 'critical']);
  const status = allowedStatuses.has(output?.status) ? output.status : 'warning';
  const summary = clampSummary(sanitizeString(output?.summary));
  const evidenceArray = Array.isArray(output?.evidence) ? output.evidence : [];
  const evidence = evidenceArray
    .map((item) => sanitizeString(item))
    .filter(Boolean)
    .slice(0, 3);

  if (!evidence.length) {
    evidence.push('Talk to a parent, guardian, or educator when something feels uncomfortable online.');
  }

  return {
    status,
    summary,
    evidence,
    source: 'ollama',
  };
}

function sanitizeInput(text) {
  if (!text) return '';
  return text
    .replace(/https?:\/\/\S+/gi, '[link]')
    .replace(/[\w.-]+@[\w.-]+/g, '[email]')
    .replace(/\b\d{3,}\b/g, '[number]')
    .trim();
}

function sanitizeString(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[<>]/g, '').trim();
}

function postProcessTrainerText(text) {
  // Strip any leading speaker labels the model might add
  let t = text.trim();
  t = t.replace(/^(assistant|you|bot|system|ai|\w+):\s*/i, '');
  // Remove code fences or quotes accidentally returned
  t = t.replace(/^```[\s\S]*?```$/g, '').replace(/^"|"$/g, '');
  // Keep it short and clean
  if (t.length > 400) t = `${t.slice(0, 397)}...`;
  return sanitizeString(t);
}

function looksMeta(text) {
  const t = String(text || '').toLowerCase();
  if (!t) return true;
  if (/(the user|previous interaction|conversation|as an ai|assistant|system message)/.test(t)) return true;
  if (/^(you|user|assistant|system)\s*:/.test(t)) return true;
  if (/^\s*\{|^\s*\[/.test(t)) return true;
  return false;
}

function friendlyFallback(history, { persona, difficulty }) {
  const lastUser = [...(history || [])].reverse().find((m) => m.sender === 'user');
  const msg = (lastUser?.text || '').toLowerCase();
  const isGreeting = /\b(hi|hello|hey|yo|sup|hiya)\b/.test(msg);
  const isQuestion = /\?$/.test(msg);
  const easy = () => (isGreeting
    ? 'Hey! Nice to hear from you. How is your day going?'
    : isQuestion
      ? 'Good question—what made you curious about that?'
      : 'Cool! What are you into lately?');
  const medium = () => (isGreeting
    ? 'Hey! I saw your post earlier—what are you working on?'
    : isQuestion
      ? 'Interesting—tell me more about what you mean.'
      : 'That sounds fun. Want to chat a bit more here?');
  const hard = () => (isGreeting
    ? 'Hey! You seem cool—do you hang out here often?'
    : isQuestion
      ? 'Maybe! What makes you ask?'
      : 'We could keep chatting here a bit—what do you think?');
  const pick = difficulty === 'easy' ? easy : difficulty === 'hard' ? hard : medium;
  return pick();
}

function clampSummary(summary) {
  const fallback = 'Unable to interpret AI response. Stay cautious and consult a trusted adult.';
  if (!summary) return fallback;
  if (summary.length <= 240) return summary;
  return `${summary.slice(0, 237)}...`;
}

function parseModelResponse(raw) {
  if (typeof raw === 'object' && raw !== null) {
    return raw;
  }
  if (typeof raw !== 'string') {
    throw new Error('OLLAMA_INVALID_RESPONSE: Model response not understood.');
  }
  const direct = tryParseJson(raw);
  if (direct) return direct;
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    const extracted = tryParseJson(jsonMatch[0]);
    if (extracted) return extracted;
  }
  throw new Error('OLLAMA_INVALID_RESPONSE: Model did not return valid JSON.');
}

function tryParseJson(candidate) {
  try {
    return JSON.parse(candidate);
  } catch (error) {
    return null;
  }
}

const safetyIndicators = [
  {
    severity: 'critical',
    patterns: ['keep it secret', "don't tell", 'do not tell', 'keep this secret', 'send photo', 'send a photo', 'meet alone', 'private chat', 'switch apps', 'video call'],
    summary: 'Critical: Strong warning signs detected. Stop and involve a trusted adult immediately.',
    evidence: [
      'The message pressures for secrecy or moving platforms.',
      'Stop responding and talk to a caregiver or guardian right away.',
    ],
  },
  {
    severity: 'warning',
    patterns: ['gift', 'surprise', 'special favor', 'how old are you', 'are you alone'],
    summary: 'Warning: Potential grooming signals. Stay cautious and involve trusted adults.',
    evidence: [
      'Discuss the conversation with a parent, guardian, or educator.',
    ],
  },
];

const severityRank = {
  safe: 0,
  warning: 1,
  critical: 2,
};

function applySafetyOverrides(text, result) {
  const normalizedText = text.toLowerCase();
  let adjusted = { ...result, evidence: [...(result.evidence || [])] };

  for (const indicator of safetyIndicators) {
    if (indicator.patterns.some((pattern) => normalizedText.includes(pattern))) {
      if (severityRank[indicator.severity] > severityRank[adjusted.status]) {
        adjusted.status = indicator.severity;
        adjusted.summary = indicator.summary;
      }
      for (const tip of indicator.evidence) {
        if (!adjusted.evidence.includes(tip)) {
          adjusted.evidence.push(tip);
        }
      }
    }
  }

  adjusted.evidence = adjusted.evidence.filter(Boolean).slice(0, 3);
  return adjusted;
}

function buildHttpError(status, body = '') {
  const error = new Error(`Ollama request failed with status ${status}`);
  error.code = status;
  error.details = body;
  return error;
}

function wrapClientError(error) {
  if (error?.name === 'AbortError') {
    const wrapped = new Error('OLLAMA_TIMEOUT: The local model did not respond in time.');
    wrapped.code = 'timeout';
    return wrapped;
  }
  if (error?.code === 403) {
    const wrapped = new Error('OLLAMA_FORBIDDEN: Local model rejected the request. Ensure the API allows local connections.');
    wrapped.code = 403;
    wrapped.details = error.details;
    return wrapped;
  }
  if (String(error?.message || '').startsWith('OLLAMA')) {
    return error;
  }
  const wrapped = new Error(`OLLAMA_UNAVAILABLE: ${error?.message || 'Unknown error'}`);
  wrapped.details = error?.details;
  return wrapped;
}

