import { classifyText } from './scripts/background_analyzer.js';
import { notifyIfUnusual } from './scripts/parent_notifier.js';

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'analyze-selection') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: getSelectedText,
      });
      if (!result) return;
      const analysis = await classifyText(result);
      // Fire-and-forget notify if unusual
      notifyIfUnusual(analysis, { pageUrl: tab.url, trigger: 'command:analyze-selection', snippet: String(result || '').slice(0, 400) });
      chrome.tabs.sendMessage(tab.id, {
        type: 'analysisResultFromCommand',
        data: analysis,
      });
    } catch (error) {
      console.error('Command analysis failed', error);
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'requestAnalysis') {
    Promise.resolve()
      .then(() => classifyText(message.text || ''))
      .then((analysis) => {
        // Attempt to capture URL from sender tab if available
        const pageUrl = sender?.tab?.url || undefined;
        notifyIfUnusual(analysis, { pageUrl, trigger: 'message:requestAnalysis', snippet: String(message.text || '').slice(0, 400) });
        sendResponse(analysis);
      })
      .catch((error) => {
        console.error('Background analysis failed', error);
        sendResponse({
          status: 'critical',
          summary: 'We could not analyze this text with the local AI. Please review with a trusted adult.',
          evidence: [
            'No data was sent externally; analysis stayed on this device.',
            `Technical note: ${error?.message || 'Unknown error'}`,
          ],
          source: 'fallback',
        });
      });
    return true; // keep the message channel open for async sendResponse
  }
  return false;
});

function getSelectedText() {
  const selection = window.getSelection();
  return selection ? selection.toString() : '';
}

