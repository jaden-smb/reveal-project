import { classifyWithOllama } from './llm/ollama_client.js';

export async function classifyText(text) {
  try {
    const result = await classifyWithOllama(text);
    return result;
  } catch (error) {
    console.warn('Local model load failed or unavailable, using fallback logic.', error);
    return augmentFallback(ruleBasedClassifier(text), error);
  }
}

function ruleBasedClassifier(text) {
  const normalized = text.toLowerCase();
  if (!normalized.trim()) {
    return {
      status: 'warning',
      summary: 'No text selected for analysis.',
      evidence: ['Highlight conversation text to get guidance.'],
    };
  }
  if (normalized.includes('secret') || normalized.includes('do not tell')) {
    return {
      status: 'critical',
      summary: 'Critical: Requests for secrecy are strong warning signs.',
      evidence: ['Encourage immediate discussion with guardians.'],
    };
  }
  if (normalized.includes('gift') || normalized.includes('surprise')) {
    return {
      status: 'warning',
      summary: 'Warning: Promises of gifts or rewards can be manipulative.',
      evidence: ['Pause and share with a trusted adult before responding.'],
    };
  }
  return null;
}

function augmentFallback(ruleResult, error) {
  const reason = typeof error?.message === 'string' ? error.message : 'Unknown issue';
  const base =
    ruleResult ||
    {
      status: 'warning',
      summary: 'Local AI unavailable. Review the text carefully with a trusted adult.',
      evidence: [],
    };
  return {
    ...base,
    evidence: [
      ...(base.evidence || []),
      'The extension did not send any data to external services.',
      `Technical note: ${reason}`,
    ],
    source: 'fallback',
  };
}

