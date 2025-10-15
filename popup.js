import { SimulationEngine } from './scripts/simulation_engine.js';
import { RiskAnalyzer } from './scripts/risk_analyzer.js';
import { ResourceLibrary } from './scripts/resource_library.js';
import { ProgressTracker } from './scripts/progress_tracker.js';

const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.tab-panel');
const chatWindow = document.getElementById('chat-window');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const feedbackEl = document.getElementById('simulation-feedback');
const restartBtn = document.getElementById('restart-simulation');
const nextScenarioBtn = document.getElementById('next-simulation');
const analysisInput = document.getElementById('analysis-input');
const analysisBtn = document.getElementById('run-analysis');
const analysisResultEl = document.getElementById('analysis-result');
const analyzePageBtn = document.getElementById('analyze-page');
const resourceListEl = document.getElementById('resource-list');
const progressSummaryEl = document.getElementById('progress-summary');
const modeSwitch = document.getElementById('mode-switch');

const simulationEngine = new SimulationEngine({
  onMessage: appendChatMessage,
  onFeedback: renderSimulationFeedback,
  onProgress: updateProgress,
});

const riskAnalyzer = new RiskAnalyzer({
  onResult: renderAnalysisResult,
});

const resourceLibrary = new ResourceLibrary({
  container: resourceListEl,
});

const progressTracker = new ProgressTracker({
  container: progressSummaryEl,
});

setupTabs();
ensureFirstOpenDefaults();
resourceLibrary.render(modeSwitch.value);
progressTracker.render();
// Start with a blank slate: do not auto-start the scenario.

modeSwitch.addEventListener('change', () => {
  const mode = modeSwitch.value;
  resourceLibrary.render(mode);
  simulationEngine.setMode(mode);
  progressTracker.setMode(mode);
});

chatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  appendChatMessage({ sender: 'user', text });
  chatInput.value = '';
  // Lazy-start the scenario on first user message
  if (!hasStarted()) {
    simulationEngine.startScenario({ silent: true });
  }
  simulationEngine.handleUserInput(text);
});

restartBtn.addEventListener('click', () => {
  clearChat();
  simulationEngine.restartScenario();
});

nextScenarioBtn.addEventListener('click', () => {
  clearChat();
  simulationEngine.nextScenario();
});

analysisBtn.addEventListener('click', async () => {
  const text = analysisInput.value.trim();
  if (!text) {
    renderAnalysisResult({ status: 'warning', summary: 'Please provide some text to analyze.' });
    return;
  }
  analysisBtn.disabled = true;
  renderAnalysisResult({ status: 'loading', summary: 'Analyzing text using the local AI model…' });
  try {
    await riskAnalyzer.analyzeText(text);
  } finally {
    analysisBtn.disabled = false;
  }
});

analyzePageBtn.addEventListener('click', async () => {
  renderAnalysisResult({ status: 'loading', summary: 'Analyzing conversation on this page…' });
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab');
    let response;
    try {
      response = await chrome.tabs.sendMessage(tab.id, { type: 'analyzePageConversation' });
    } catch (e) {
      // Content script may not be injected on this page. Fallback: inject a scraper and analyze directly via background.
      const [{ result: text }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const container = document.getElementById('conversation');
          let t = '';
          if (container) {
            t = Array.from(container.querySelectorAll('p,li,div'))
              .map((el) => el.textContent.trim())
              .filter(Boolean)
              .join('\n');
          }
          if (!t) {
            const sel = window.getSelection();
            t = sel && sel.toString().trim();
          }
          if (!t) {
            t = document.body?.innerText?.trim() || '';
          }
          return t;
        },
      });
      response = await chrome.runtime.sendMessage({ type: 'requestAnalysis', text });
    }
    renderAnalysisResult(response || { status: 'warning', summary: 'No response from the page.' });
  } catch (error) {
    renderAnalysisResult({ status: 'critical', summary: `Could not analyze this page: ${error.message}` });
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'analyzeSelection' && message.data) {
    renderAnalysisResult(message.data);
  }
});

function setupTabs() {
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      panels.forEach((panel) => panel.classList.remove('active'));
      tab.classList.add('active');
      const target = document.getElementById(tab.dataset.tab);
      if (target) target.classList.add('active');
    });
  });
}

async function ensureFirstOpenDefaults() {
  try {
    const activateAnalysis = () => {
      const targetId = 'analysis';
      tabs.forEach((t) => t.classList.remove('active'));
      panels.forEach((p) => p.classList.remove('active'));
      const tabBtn = Array.from(tabs).find((t) => t.dataset.tab === targetId);
      const panel = document.getElementById(targetId);
      if (tabBtn) tabBtn.classList.add('active');
      if (panel) panel.classList.add('active');
    };

    // Defer activation to the next frames to avoid races with initial layout/paints
    if ('requestAnimationFrame' in window) {
      requestAnimationFrame(() => requestAnimationFrame(activateAnalysis));
    } else {
      setTimeout(activateAnalysis, 0);
    }
  } catch (e) {
    // Non-fatal: ignore errors
  }
}

function appendChatMessage({ sender, text }) {
  const bubble = document.createElement('div');
  bubble.className = `chat-message ${sender}`;
  bubble.textContent = text;
  chatWindow.appendChild(bubble);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function renderSimulationFeedback({ tone, summary, tips }) {
  feedbackEl.className = `feedback tone-${tone}`;
  feedbackEl.innerHTML = `<strong>${summary}</strong><br />${tips.join('<br />')}`;
}

function clearChat() {
  chatWindow.innerHTML = '';
  feedbackEl.textContent = '';
}

function hasStarted() {
  return chatWindow.children.length > 0;
}

function renderAnalysisResult({ status, summary, evidence }) {
  analysisResultEl.className = 'analysis-result';
  if (status === 'loading') {
    analysisResultEl.textContent = summary;
    return;
  }
  analysisResultEl.classList.add(`risk-${status}`);
  const evidenceHtml = evidence?.length
    ? `<ul>${evidence
        .map((item) => `<li>${item}</li>`)
        .join('')}</ul>`
    : '';
  analysisResultEl.innerHTML = `<strong>${summary}</strong>${evidenceHtml}`;
}

function updateProgress(progress) {
  progressTracker.update(progress);
}

