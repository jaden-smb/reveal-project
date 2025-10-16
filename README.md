# Reveal: Safe Chat Trainer
Reveal is a Chromium-based browser extension prototype designed to educate and support young learners, parents, and educators in recognizing and responding to online grooming tactics. The project combines safe chat simulations, a risk analysis demo powered by an offline-friendly LLM, gamified progress tracking, and curated educational resources.

## Purpose

This extension helps users practice identifying risky online chat behaviors and get supportive guidance. It includes:
- Chat Trainer: a guided simulation with feedback.
- Risk Scan: analyze selected text or the current page using a local LLM (Ollama) with safe, on-device processing and a rule-based fallback.
- Learn & Support: curated resources.
- Progress: simple progress tracking.

## Architecture overview

- `manifest.json`: MV3 definition, popup UI, background service worker, content script.
- `popup.html/.js/.css`: Tabs for Simulator, Risk Scan, Resources, Progress. Sends analysis requests and renders results.
- `content.js`: Injected on all pages. Forwards command results to popup, handles "Analyze Current Page" and demo `window.postMessage` requests, extracts conversation text.
- `background.js`: Receives analysis requests, calls `scripts/background_analyzer.js` to classify text, returns results.
- `scripts/background_analyzer.js`: Tries local LLM first; if unavailable, falls back to rule-based signals and annotates with a technical note.
- `scripts/llm/ollama_client.js`: Calls a local Ollama instance (`http://127.0.0.1:11434/api/generate`) with a strict JSON schema, normalizes output, and applies safety overrides.
- Other scripts: simulation engine, resource library, progress tracker.

Data flow (Risk Scan):
1. Popup requests analysis of input text OR asks the content script to analyze the current page.
2. Content script extracts text (from `#conversation` in the demo or selection/body) and sends `requestAnalysis` to background.
3. Background classifies the text (LLM or fallback) and returns a normalized object `{ status, summary, evidence, source }`.
4. Popup renders the result.

Keyboard shortcut: highlight text on any page and press Ctrl+Shift+Y to analyze.

## Demo page

- File: `docs/demo.html` contains only the conversation from `demo_conversation.txt`.
- Open it in a browser tab (with the extension loaded). In the popup:
  - Go to Risk Scan > click "Analyze Current Page" to analyze the conversation.
  - Or highlight any part and press Ctrl+Shift+Y.

## Running with a local LLM (optional)

Install and run [Ollama](https://ollama.ai/). Ensure the API is available at `http://127.0.0.1:11434` and pull a suitable chat model, e.g. `mistral:7b-instruct`. Without Ollama running, the extension uses the built-in rule-based fallback.

### Troubleshooting: OLLAMA_FORBIDDEN on Windows 11

If you see a technical note in results like:

> OLLAMA_FORBIDDEN: Local model rejected the request. Ensure the API allows local connections.

Modern Ollama versions restrict which browser origins can call the local API. Allow your extension's origin by setting `OLLAMA_ORIGINS` and restarting the service.

Steps (PowerShell):

1. Allow common extension/browser origins:

```powershell
$env:OLLAMA_ORIGINS = "chrome-extension://*,edge-extension://*,brave-extension://*,http://localhost:*,http://127.0.0.1:*"
```

To persist across sessions:

```powershell
[System.Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "chrome-extension://*,edge-extension://*,brave-extension://*,http://localhost:*,http://127.0.0.1:*", "User")
```

2. Restart Ollama:

```powershell
taskkill /IM ollama.exe /F 2>$null
Start-Process -FilePath ollama -ArgumentList "serve"
```

3. Verify the API is reachable (note: /api/version can succeed even when /api/generate is forbidden):

```powershell
curl http://127.0.0.1:11434/api/version
```

If this returns version JSON, retry the extension. Ensure your firewall allows local connections to port 11434.

If you still see OLLAMA_FORBIDDEN when analyzing:

- Confirm the environment variable is applied to the process actually running Ollama. If you installed Ollama as a Windows service or start it via a manager, set the variable at the User (or System) level and restart that process/session.

Set at System level (requires admin PowerShell):

```powershell
[System.Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "chrome-extension://*,edge-extension://*,brave-extension://*,http://localhost:*,http://127.0.0.1:*", "Machine")
```

Then restart the Ollama service/process.

Exact-origin allow (if wildcards are restricted in your build):
1. Load the extension and copy its ID from chrome://extensions (e.g., `abcd1234efghijklmnop`)
2. Set an exact origin for your extension:

```powershell
$extId = "<your-extension-id>"
[System.Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "chrome-extension://$extId,http://localhost:*,http://127.0.0.1:*", "User")
```

3. Restart Ollama.

Validate with an Origin header (simulating a browser):

```powershell
curl -Method GET -Headers @{ 'Origin' = 'chrome-extension://<your-extension-id>' } http://127.0.0.1:11434/api/version
```

If version returns with your Origin header, retry the extension’s “Check Local AI” → it should report “ready”.

## Privacy

- Analysis runs locally. No data is sent to external services by this extension.
- Inputs are sanitized before being sent to the local model.
# Reveal – Educational Anti-Grooming Extension

Reveal is a Chromium-based browser extension prototype designed to educate and support young learners, parents, and educators in recognizing and responding to online grooming tactics. The project combines safe chat simulations, a risk analysis demo powered by an offline-friendly LLM, gamified progress tracking, and curated educational resources.

## Extension Structure

- `manifest.json`: Manifest V3 configuration with background service worker, popup UI, content script, and command for quick risk scans.
- `popup.html` / `popup.css` / `popup.js`: Main interface housing chat trainer, risk analyzer, resource hub, and progress tracker.
- `background.js`: Handles keyboard shortcut analysis and routes messages to the local AI classifier.
- `content.js`: Receives background analysis results and forwards them to the popup.
- `scripts/`
  - `simulation_engine.js`: Runs interactive chat scenarios with adaptive feedback.
  - `training_scenarios.js`: Scenario definitions and evaluation logic.
  - `risk_analyzer.js`: Popup-side analyzer that calls the local Ollama LLM client.
  - `resource_library.js`: Renders trusted information cards per user mode.
  - `progress_tracker.js`: Tracks points and badges earned across simulations.
  - `background_analyzer.js`: Background classifier that uses the Ollama client with rule-based fallback.
  - `llm/ollama_client.js`: Communicates with a local Ollama instance to analyse text using a free, self-hosted model.
- `assets/`: Prototype icons for packaging.

## Key Workflows

### Chat Simulation
1. The learner selects a mode (Learner or Tutor) using the popup switcher.
2. `SimulationEngine` loads the current scenario from `sampleScenarios`, displays the initial prompt, and walks through each step.
3. Learner responses are evaluated with categorized patterns that trigger feedback and award points/badges via `ProgressTracker`.
4. Summary feedback encourages safe behaviour and suggests trusted adult involvement when risks appear.

### Risk Analysis Demo
1. Users paste text into the Risk Scan tab or trigger the keyboard shortcut (`Ctrl+Shift+Y`) after selecting text on the page.
2. `RiskAnalyzer` (popup) or `background.js` sends text to `background_analyzer.classifyText`.
3. The classifier contacts the local Ollama model via `ollama_client.js`. If the Ollama endpoint is unreachable, it falls back to rule-based heuristics without sending data externally.
4. Results classify the snippet as `safe`, `warning`, or `critical` with educational explanations.

### Educational & Support Resources
- Mode-specific resource cards link to verified hotlines and guidance for families and educators.
- Content focuses on prevention, privacy, and digital citizenship.

## Safety & Privacy

- Simulated chats and AI analysis never store or transmit user data. All processing is local to the extension.
- Scenarios avoid explicit content; language and feedback stay supportive and age-appropriate.
- Prominent footer reminder encourages involving trusted adults.

## Development Notes

- The prototype integrates [Ollama](https://ollama.ai/) for local, no-cost inference. If Ollama is not running, the extension automatically relies on the embedded rule-based fallback.
- Icons are placeholder PNGs. Replace them with branded artwork before release.
- Extend `training_scenarios.js` with more branches or dynamic scoring to increase realism and replay value.
- Add localization by mapping copy strings to language files and switching per user preference.

## Testing the Prototype

1. Open `chrome://extensions` in Chrome/Edge/Brave and enable Developer Mode.
2. Click “Load unpacked” and select the project directory.
3. Start a local Ollama server (`ollama serve`) and pull a compatible model such as `mistral:7b-instruct` with `ollama pull mistral:7b-instruct`.
4. Pin the Reveal extension and open the popup to explore each tab.
5. Try the chat simulation, paste a sample conversation in Risk Scan, and trigger the keyboard shortcut on highlighted text to view background analysis.

## License

Prototype for educational and preventive demonstration. Validate compliance and content with local regulations before broader use.


## Parent Email Alerts (Test Mode)

When the analyzer flags something unusual (status = `warning` or `critical`), the extension can automatically notify a parent/guardian email for testing. The default recipient is `santiagomontoyabaiter@gmail.com`.

- Notifier module: `scripts/parent_notifier.js`
- Trigger points: `background.js` on both keyboard command and page/popup analysis requests.
- Rate limiting: avoids duplicate emails by hashing context and enforces a minimum 5 minutes between identical alerts.

Sending options:
1) EmailJS (automated)
  - Create an EmailJS account and set up a Service and a Template that accepts: `to_email`, `to_name`, `from_name`, `subject`, `message`, `page_url`, `status`.
  - Store the credentials in `chrome.storage.local` for the extension:
    - `emailjs_service_id`
    - `emailjs_template_id`
    - `emailjs_public_key`
    - Optional: `emailjs_to_name`, `emailjs_from_name`
  - The manifest includes `https://api.emailjs.com/*` host permission.

2) Mailto fallback (no external service)
  - If EmailJS is not configured, the notifier opens a `mailto:` URL in a new tab with the subject and body prefilled. Your default email client will prompt to send.

What counts as "unusual"?
- Any result with status `warning` or `critical`.

Quick test
1. Load the extension in Developer Mode.
2. Open the popup, Risk Scan tab. Enter a message containing "secret" or "do not tell".
3. Click Run Analysis. A mail tab should open (if EmailJS not configured) or the email will be sent via EmailJS.

Note: This is intended for testing/demo. Review privacy needs before enabling in production settings.

