// Parent notifier utility
// Sends an alert email when unusual analysis is detected.
// Provider priority:
// 1) EmailJS REST API (requires service_id, template_id, public_key)
// 2) mailto: fallback (opens default email client prefilled)

const PARENT_EMAIL = 'santiagomontoyabaiter@gmail.com';
const RATE_LIMIT_MS = 5 * 60 * 1000; // 5 minutes
const EMAILJS_ENDPOINT = 'https://api.emailjs.com/api/v1.0/email/send';

/**
 * Determine if an analysis result is unusual enough to notify.
 * We consider 'warning' and 'critical' statuses as unusual.
 */
export function isUnusual(analysis) {
  const status = (analysis?.status || '').toLowerCase();
  return status === 'warning' || status === 'critical';
}

/**
 * Notify parent if the analysis is unusual, with basic rate limiting and dedupe.
 * context: { pageUrl?: string, trigger?: string, snippet?: string }
 */
export async function notifyIfUnusual(analysis, context = {}) {
  try {
    if (!isUnusual(analysis)) return;

    const now = Date.now();
    const keyTs = 'parent_notify_last_ts';
    const keyHash = 'parent_notify_last_hash';
    const hash = stableHash({ s: analysis?.summary, u: context?.pageUrl, t: analysis?.status });
    const { [keyTs]: lastTs = 0, [keyHash]: lastHash = '' } = await chrome.storage?.local?.get?.([keyTs, keyHash]) || {};

    if (lastTs && now - lastTs < RATE_LIMIT_MS && lastHash === hash) {
      // Skip duplicate within rate window
      return;
    }

  const subject = `Reveal Alert: ${String(analysis?.status || 'notice').toUpperCase()} detected`;
    const body = buildEmailBody(analysis, context);

    const sent = await trySendViaEmailJS(subject, body, {
      to_email: PARENT_EMAIL,
      page_url: context?.pageUrl || 'unknown',
      status: analysis?.status || 'unknown',
    });

    if (!sent) {
      await openMailtoFallback(subject, body);
    }

    await chrome.storage.local.set({ [keyTs]: now, [keyHash]: hash });
  } catch (err) {
    console.warn('Parent notifier failed:', err);
  }
}

function buildEmailBody(analysis, context) {
  const ts = new Date().toISOString();
  const lines = [];
  lines.push('Reveal automatic alert (test mode)');
  lines.push(`Time: ${ts}`);
  if (context?.pageUrl) lines.push(`Page: ${context.pageUrl}`);
  if (context?.trigger) lines.push(`Trigger: ${context.trigger}`);
  lines.push('');
  lines.push(`Status: ${analysis?.status || 'unknown'}`);
  if (analysis?.summary) lines.push(`Summary: ${analysis.summary}`);
  if (Array.isArray(analysis?.evidence) && analysis.evidence.length) {
    lines.push('Evidence:');
    analysis.evidence.forEach((e, i) => lines.push(`  ${i + 1}. ${e}`));
  }
  if (context?.snippet) {
    lines.push('');
    lines.push('Conversation excerpt (first 400 chars):');
    lines.push(context.snippet.slice(0, 400));
  }
  lines.push('');
  lines.push('What to review: Please look at the highlighted concerning parts of the conversation and discuss safe responses.');
  lines.push('This email was generated for testing purposes.');
  return lines.join('\n');
}

async function trySendViaEmailJS(subject, body, extraParams = {}) {
  try {
    const cfgKeys = ['emailjs_service_id', 'emailjs_template_id', 'emailjs_public_key', 'emailjs_to_name', 'emailjs_from_name'];
    const cfg = await chrome.storage?.local?.get?.(cfgKeys) || {};
    const service_id = cfg.emailjs_service_id;
    const template_id = cfg.emailjs_template_id;
    const public_key = cfg.emailjs_public_key;
    if (!service_id || !template_id || !public_key) {
      return false; // not configured
    }

    const template_params = {
      to_email: extraParams.to_email,
      to_name: cfg.emailjs_to_name || 'Parent/Guardian',
  from_name: cfg.emailjs_from_name || 'Reveal',
      subject,
      message: body,
      page_url: extraParams.page_url,
      status: extraParams.status,
    };

    const payload = {
      service_id,
      template_id,
      user_id: public_key,
      template_params,
    };

    const res = await fetch(EMAILJS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn('EmailJS send failed', res.status, text);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('EmailJS send error', e);
    return false;
  }
}

async function openMailtoFallback(subject, body) {
  try {
    const url = `mailto:${encodeURIComponent(PARENT_EMAIL)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    // Opening a tab for mailto helps some environments, though it may prompt the user
    await chrome.tabs.create({ url });
  } catch (e) {
    console.warn('mailto fallback failed', e);
  }
}

function stableHash(obj) {
  try {
    const json = JSON.stringify(obj);
    let h = 0;
    for (let i = 0; i < json.length; i++) {
      h = (h * 31 + json.charCodeAt(i)) | 0;
    }
    return String(h);
  } catch {
    return String(Math.random());
  }
}
