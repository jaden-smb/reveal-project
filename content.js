chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Forward command-based results to the popup
  if (message.type === 'analysisResultFromCommand') {
    chrome.runtime.sendMessage({ type: 'analyzeSelection', data: message.data });
    return;
  }

  // Analyze the visible conversation on the page
  if (message.type === 'analyzePageConversation') {
    (async () => {
      try {
        const text = extractConversationText();
        const result = await chrome.runtime.sendMessage({ type: 'requestAnalysis', text });
        sendResponse(result);
      } catch (error) {
        sendResponse({ status: 'critical', summary: `Page analysis failed: ${error?.message || 'Unknown error'}` });
      }
    })();
    return true; // keep channel open for async
  }
});

// Allow demo pages to trigger analysis via window.postMessage
window.addEventListener('message', (event) => {
  if (!event?.data || typeof event.data !== 'object') return;
  if (event.data.type === 'DEMO_REQUEST_ANALYSIS') {
    const text = extractConversationText();
    chrome.runtime.sendMessage({ type: 'requestAnalysis', text }).then((result) => {
      window.postMessage({ type: 'DEMO_ANALYSIS_RESULT', data: result }, '*');
    });
  }
});

function extractConversationText() {
  // Basic heuristic: collect text from the #conversation container if present,
  // otherwise fallback to selected text or the page body text.
  const container = document.getElementById('conversation');
  let text = '';
  if (container) {
    text = Array.from(container.querySelectorAll('p,li,div'))
      .map((el) => el.textContent.trim())
      .filter(Boolean)
      .join('\n');
  }
  if (!text) {
    const selection = window.getSelection();
    text = selection && selection.toString().trim();
  }
  if (!text) {
    text = document.body?.innerText?.trim() || '';
  }
  return text;
}

