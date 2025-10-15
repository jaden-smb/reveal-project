import { classifyWithOllama } from './llm/ollama_client.js';
import { notifyIfUnusual } from './parent_notifier.js';

export class RiskAnalyzer {
  #callbacks;
  constructor(callbacks) {
    this.#callbacks = callbacks;
  }

  async analyzeText(text) {
    try {
      const result = await classifyWithOllama(text);
      this.#callbacks.onResult?.(result);
      const url = await getActiveTabUrl();
      notifyIfUnusual(result, { pageUrl: url, trigger: 'popup:risk-analyzer', snippet: String(text || '').slice(0, 400) });
    } catch (error) {
      console.error('Risk analysis failed', error);
      const evidence = [
        'No data was sent externally; analysis stayed on this device.',
        `Technical note: ${error.message}`,
      ];
      if (error.details) {
        evidence.push(`Details: ${error.details}`);
      }
      const fallback = {
        status: 'critical',
        summary: 'We could not analyze this text with the local AI. Please review with a trusted adult.',
        evidence,
        source: 'fallback',
      };
      this.#callbacks.onResult?.(fallback);
      const url = await getActiveTabUrl();
      notifyIfUnusual(fallback, { pageUrl: url, trigger: 'popup:risk-analyzer', snippet: String(text || '').slice(0, 400) });
    }
  }
}

async function getActiveTabUrl() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.url || undefined;
  } catch {
    return undefined;
  }
}

