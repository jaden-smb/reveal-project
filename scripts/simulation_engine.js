import { sampleScenarios } from './training_scenarios.js';
import { generateTrainerReply } from './llm/ollama_client.js';
import { classifyWithOllama } from './llm/ollama_client.js';

export class SimulationEngine {
  #mode = 'learner';
  #scenarioIndex = 0;
  #history = [];
  #persona = 'FriendFun21';
  #difficulty = 'medium';
  #callbacks;

  constructor(callbacks) {
    this.#callbacks = callbacks;
  }

  setMode(mode) {
    this.#mode = mode;
  }

  startScenario(opts = {}) {
    // Blank slate: reset chat state and open with a natural intro from persona
    this.#history = [];
    const scenario = this.#currentScenario();
    this.#persona = scenario.persona || scenario.id || 'Peer';
    this.#difficulty = scenario.difficulty || 'medium';
    const intro = scenario.intro || `Hey! Want to chat for a sec?`;
    if (!opts.silent) {
      this.#pushAndEmit({ sender: 'ai', text: intro });
    }
  }

  restartScenario() {
    // Keep current scenario but clear history
    this.startScenario();
  }

  nextScenario() {
    this.#scenarioIndex = (this.#scenarioIndex + 1) % sampleScenarios.length;
    this.startScenario();
  }

  async handleUserInput(text) {
    // Record user message
    this.#pushToHistory({ sender: 'user', text });
    // Analyze the turn for feedback using the local classifier
    try {
      const analysis = await classifyWithOllama(text);
      this.#emitFeedback(mapAnalysisToFeedback(analysis));
      const reward = mapAnalysisToReward(analysis);
      if (reward) {
        this.#callbacks.onProgress?.({
          scenarioId: this.#currentScenario().id,
          reward,
        });
      }
    } catch (_e) {
      // Non-fatal: skip feedback on failure
    }

    // Generate trainer reply from LLM
    const reply = await generateTrainerReply(this.#history, {
      persona: this.#persona,
      difficulty: this.#difficulty,
      mode: this.#mode,
    });
    this.#pushAndEmit({ sender: 'ai', text: reply });
  }

  #completeScenario(progressReward) {
    this.#callbacks.onProgress?.({
      scenarioId: this.#currentScenario().id,
      reward: progressReward,
    });
    const closing = this.#currentScenario().closing || 'Nice work pausing and thinking things through.';
    this.#emitMessage(closing);
  }

  #emitMessage(text) {
    this.#callbacks.onMessage?.({ sender: 'ai', text });
  }

  #pushAndEmit(message) {
    this.#pushToHistory(message);
    this.#emitMessage(message.text);
  }

  #pushToHistory(message) {
    this.#history.push({ sender: message.sender, text: String(message.text || '').trim() });
    if (this.#history.length > 20) {
      this.#history = this.#history.slice(-20);
    }
  }

  #emitFeedback(feedback) {
    const tone = feedback.tone || 'coaching';
    const summary = feedback.summary;
    const tips = feedback.tips || [];
    this.#callbacks.onFeedback?.({ tone, summary, tips });
  }

  #currentScenario() {
    const base = sampleScenarios[this.#scenarioIndex];
    // Provide persona & difficulty hints for LLM; keep original fields intact
    return {
      ...base,
      persona: base.persona || (base.id === 'friendly-invite' ? 'FriendFun21' : 'SupportiveSam'),
      difficulty: base.difficulty || (base.id === 'friendly-invite' ? 'medium' : 'easy'),
    };
  }
}

function mapAnalysisToFeedback(analysis) {
  const tone = analysis?.status === 'critical' ? 'critical' : analysis?.status === 'safe' ? 'coaching' : 'caution';
  const summary = analysis?.summary || 'Keep your boundaries strong and ask questions.';
  const tips = Array.isArray(analysis?.evidence) && analysis.evidence.length
    ? analysis.evidence
    : ['Share concerns with a trusted adult before continuing.'];
  return { tone, summary, tips };
}

function mapAnalysisToReward(analysis) {
  if (!analysis?.status) return null;
  if (analysis.status === 'safe') return { points: 20, badges: [] };
  if (analysis.status === 'warning') return { points: 5, badges: [] };
  return { points: 0, badges: [] };
}

