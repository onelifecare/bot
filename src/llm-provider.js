import axios from 'axios';

/**
 * LLM Brain Provider (Phase 2 — real AI provider)
 *
 * Primary intended path: Gemini (GeminiBrainProvider).
 * Temporary legacy path: OpenAI-compatible Chat Completions (LlmBrainProvider).
 *
 * Contract: { async decide(payload) => BrainDecision }
 * Same interface expected by decideWithBrain() in brain.js.
 */

/* OpenAI legacy defaults */
const DEFAULT_API_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';

/* Gemini defaults */
const DEFAULT_GEMINI_MODEL = 'gemini-1.5-flash';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

/* ---------- System prompt ---------- */

function buildSystemPrompt(override) {
    if (override && override.trim()) return override.trim();

  return [
        'You are a customer-service AI agent for a healthcare company called One Life Care.',
        'You communicate in Egyptian Arabic.',
        'Your job: understand what the customer needs, collect relevant info, and either help them or escalate to a human agent.',
        '',
        'You MUST reply with a JSON object (no markdown, no wrapping) containing exactly these 10 fields:',
        '{',
        '  "reply_text": "string — your Arabic reply to send to the customer",',
        '  "intent": "string — detected intent (e.g. inquiry, complaint, request_human, purchase, follow_up)",',
        '  "detected_stage": "string — current conversation stage. MUST be one of: Opening, Diagnosis, Recommendation, Objection, Booking, PostSend, Closed",',
        '  "next_stage": "string — stage the conversation should move to after this reply. MUST be one of the same 7 values",',
        '  "extracted_fields": { "field_name": "value" } — any info extracted from the message (name, phone, product, etc.)',
        '  "recommended_offer": "string or null — if applicable",',
        '  "handoff_required": true/false — whether this needs a human agent,',
        '  "handoff_reason": "string — reason for handoff, empty string if not needed",',
        '  "confidence": 0.0 to 1.0 — how confident you are in your assessment,',
        '  "notes": "string — internal notes for logging"',
        '}',
        '',
        'Stage meanings (use these exact values for detected_stage and next_stage):',
        '- Opening: first contact, greeting, customer hasn\'t stated a concrete need yet.',
        '- Diagnosis: you are gathering info about the customer\'s problem, goal, or situation (e.g. weight, health issue, area of interest).',
        '- Recommendation: you are presenting a specific offer, package, or solution that fits what the customer told you.',
        '- Objection: the customer is hesitating, asking about price, comparing, or raising a concern after a recommendation.',
        '- Booking: the customer agreed and you are collecting the data needed to confirm the order (name, phone, address, etc.).',
        '- PostSend: the order/data was just confirmed on this turn; follow-up/thank-you phase.',
        '- Closed: the conversation is ended, handed off to a human, or otherwise finalized. No further AI action expected.',
        '',
        'Stage transition rules (next_stage MUST follow these):',
        '- From Opening: next_stage can be Opening, Diagnosis, or Closed.',
        '- From Diagnosis: next_stage can be Diagnosis, Recommendation, or Closed.',
        '- From Recommendation: next_stage can be Recommendation, Objection, Booking, or Closed.',
        '- From Objection: next_stage can be Objection, Recommendation, Booking, or Closed.',
        '- From Booking: next_stage can be Booking, PostSend, or Closed.',
        '- From PostSend: next_stage can be PostSend or Closed.',
        '- From Closed: next_stage stays Closed.',
        '- Never invent a stage outside the 7 allowed values. Never use Qualifying, Offering, Sales, or Sent.',
        '- If handoff_required is true, next_stage MUST be Closed.',
        '',
        'Rules:',
        '- Always reply in Egyptian Arabic.',
        '- If the customer asks for a human or the topic is sensitive/unclear, set handoff_required=true and next_stage="Closed".',
        '- Extract phone numbers, names, and any useful fields into extracted_fields.',
        '- Be helpful, warm, and professional.',
      ].join('\n');
}

/* ---------- Build user message for the LLM ---------- */

function buildUserMessage(payload) {
    const parts = [`Customer message: "${payload.message_text}"`];

  if (payload.state) {
        if (payload.state.chat_stage) {
                parts.push(`Current stage: ${payload.state.chat_stage}`);
        }
        if (payload.state.collected_fields && Object.keys(payload.state.collected_fields).length > 0) {
                parts.push(`Previously collected fields: ${JSON.stringify(payload.state.collected_fields)}`);
        }
        if (payload.state.is_new_chat) {
                parts.push('This is the first message in a new conversation.');
        }
  }

  if (payload.business_context) {
        const ctx = payload.business_context;
        if (ctx.page && ctx.page.Page_Name) {
                parts.push(`Page: ${ctx.page.Page_Name}`);
        }
        if (ctx.botControl) {
                if (ctx.botControl.Tone) parts.push(`Tone: ${ctx.botControl.Tone}`);
                if (ctx.botControl.Model) parts.push(`Model preference: ${ctx.botControl.Model}`);
        }
  }

  return parts.join('\n');
}

/* ---------- LLM Provider class ---------- */

class LlmBrainProvider {
    /**
     * @param {object} opts
     * @param {string} opts.apiKey      — API key for the LLM service
     * @param {string} [opts.model]     — model name (default: gpt-4o-mini)
     * @param {string} [opts.systemPrompt] — optional system prompt override
     * @param {string} [opts.apiUrl]    — API endpoint (default: OpenAI)
     */
  constructor({ apiKey, model, systemPrompt, apiUrl }) {
        this.providerName = 'openai';
        this.apiKey = apiKey;
        this.model = model || DEFAULT_MODEL;
        this.apiUrl = apiUrl || DEFAULT_API_URL;
        this.systemPrompt = buildSystemPrompt(systemPrompt);
  }

  async decide(payload) {
        const userMessage = buildUserMessage(payload);

      const response = await axios.post(
              this.apiUrl,
        {
                  model: this.model,
                  messages: [
                    { role: 'system', content: this.systemPrompt },
                    { role: 'user', content: userMessage },
                            ],
                  temperature: 0.3,
                  max_tokens: 800,
                  response_format: { type: 'json_object' },
        },
        {
                  headers: {
                              'Content-Type': 'application/json',
                              Authorization: `Bearer ${this.apiKey}`,
                  },
                  timeout: 15000,
        }
            );

      const content = response.data?.choices?.[0]?.message?.content;
        if (!content) {
                throw new Error('LLM returned empty content');
        }

      const parsed = JSON.parse(content);
        return parsed;
  }
}

/* ---------- Gemini JSON sanitization ---------- */

function sanitizeGeminiJson(raw) {
    let text = String(raw || '');
    text = text.replace(/^\uFEFF/, '').replace(/[\u200B-\u200D\u2060]/g, '');
    text = text.trim();
    text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
    text = text.trim();
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
        text = text.slice(firstBrace, lastBrace + 1);
    }
    text = text.replace(/,\s*([}\]])/g, '$1');
    text = text.replace(/"(?:[^"\\]|\\.)*"/g, (match) => {
        return match.replace(/[\x00-\x1f]/g, (ch) => {
            if (ch === '\n') return '\\n';
            if (ch === '\r') return '';
            if (ch === '\t') return '\\t';
            return '';
        });
    });
    return text;
}

function repairUnescapedQuotes(text) {
    const result = [];
    let i = 0;
    const len = text.length;
    while (i < len) {
        if (text[i] !== '"') { result.push(text[i]); i++; continue; }
        result.push('"');
        i++;
        while (i < len) {
            if (text[i] === '\\' && i + 1 < len) {
                result.push(text[i], text[i + 1]);
                i += 2;
                continue;
            }
            if (text[i] === '"') {
                let j = i + 1;
                while (j < len && (text[j] === ' ' || text[j] === '\t' || text[j] === '\n' || text[j] === '\r')) j++;
                const next = j < len ? text[j] : '';
                if (next === ':' || next === ',' || next === '}' || next === ']' || next === '') {
                    result.push('"');
                    i++;
                    break;
                }
                result.push('\\"');
                i++;
                continue;
            }
            result.push(text[i]);
            i++;
        }
    }
    return result.join('');
}

/* ---------- Gemini Provider class ---------- */

class GeminiBrainProvider {
    /**
     * @param {object} opts
     * @param {string} opts.apiKey       — Google Generative Language API key
     * @param {string} [opts.model]      — Gemini model (default: gemini-1.5-flash)
     * @param {string} [opts.systemPrompt] — optional system prompt override
     */
  constructor({ apiKey, model, systemPrompt }) {
        this.providerName = 'gemini';
        this.apiKey = apiKey;
        this.model = model || DEFAULT_GEMINI_MODEL;
        this.systemPrompt = buildSystemPrompt(systemPrompt);
  }

  async decide(payload) {
        const userMessage = buildUserMessage(payload);
        const url = `${GEMINI_BASE_URL}/${encodeURIComponent(this.model)}:generateContent`;

      let response;
      try {
        response = await axios.post(
              url,
              {
                        systemInstruction: { parts: [{ text: this.systemPrompt }] },
                        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
                        generationConfig: {
                                    temperature: 0.3,
                                    maxOutputTokens: 800,
                                    responseMimeType: 'application/json'
                        }
              },
              {
                        headers: {
                                    'Content-Type': 'application/json',
                                    'x-goog-api-key': this.apiKey
                        },
                        timeout: 15000
              }
        );
      } catch (err) {
        const status = err.response?.status;
        const code = err.code;
        const body = err.response?.data;
        const bodyStr = body ? JSON.stringify(body).slice(0, 500) : '<no body>';
        console.error(`[gemini] request_failed status=${status} code=${code} model=${this.model} body=${bodyStr}`);
        throw err;
      }

      console.log(`[gemini] request_ok status=${response.status} model=${this.model}`);

      const candidate = response.data?.candidates?.[0];
      const parts = candidate?.content?.parts;
        const content = Array.isArray(parts) ? parts.map((p) => p?.text || '').join('').trim() : '';
        if (!content) {
                const finishReason = candidate?.finishReason || '<none>';
                const promptFeedback = JSON.stringify(response.data?.promptFeedback || {}).slice(0, 300);
                console.error(`[gemini] empty_content finishReason=${finishReason} promptFeedback=${promptFeedback}`);
                throw new Error('Gemini returned empty content');
        }

      try {
        return JSON.parse(content);
      } catch (_firstErr) {
        const sanitized = sanitizeGeminiJson(content);
        try {
          const parsed = JSON.parse(sanitized);
          console.log('[gemini] parse_repaired_success strategy=sanitize');
          return parsed;
        } catch (_secondErr) {
          const repaired = repairUnescapedQuotes(sanitized);
          try {
            const parsed = JSON.parse(repaired);
            console.log('[gemini] parse_repaired_success strategy=quote_repair');
            return parsed;
          } catch (parseErr) {
            const opens = (sanitized.match(/{/g) || []).length;
            const closes = (sanitized.match(/}/g) || []).length;
            const hint = opens > closes ? 'likely_truncated' : 'malformed_content';
            console.error(`[gemini] parse_failed error=${parseErr.message} hint=${hint} len=${content.length} raw_start=${content.slice(0, 300)} raw_end=${content.slice(-200)}`);
            throw parseErr;
          }
        }
      }
  }
}

/* ---------- Factory (called once at startup) ---------- */

/**
 * Creates the appropriate brain provider based on config.
 * Returns a provider instance if configured, or null to let brain.js fall back to Mock.
 *
 * Strategic direction: Gemini.
 * OpenAI path is kept as a temporary legacy compatibility layer.
 *
 * @param {object} cfg — config object from config.js
 * @returns {GeminiBrainProvider|LlmBrainProvider|null}
 */
export function createBrainProvider(cfg) {
    const providerType = (cfg.brainProvider || 'mock').toLowerCase().trim();

  if (providerType === 'mock') {
        console.log('[llm-provider] BRAIN_PROVIDER=mock — using MockBrainProvider fallback');
        return null;
  }

  if (providerType === 'gemini') {
        if (!cfg.geminiApiKey) {
                console.warn('[llm-provider] BRAIN_PROVIDER=gemini but GEMINI_API_KEY is missing — falling back to Mock');
                return null;
        }

      const provider = new GeminiBrainProvider({
              apiKey: cfg.geminiApiKey,
              model: cfg.geminiModel,
              systemPrompt: cfg.aiSystemPrompt
      });

      console.log(`[llm-provider] Gemini provider initialized: model=${provider.model}`);
        return provider;
  }

  if (providerType === 'openai') {
        if (!cfg.openaiApiKey) {
                console.warn('[llm-provider] BRAIN_PROVIDER=openai but OPENAI_API_KEY is missing — falling back to Mock');
                return null;
        }

      const provider = new LlmBrainProvider({
              apiKey: cfg.openaiApiKey,
              model: cfg.aiModel,
              systemPrompt: cfg.aiSystemPrompt,
              apiUrl: cfg.aiApiUrl,
      });

      console.warn('[llm-provider] BRAIN_PROVIDER=openai is legacy; strategic direction is Gemini');
        console.log(`[llm-provider] OpenAI (legacy) provider initialized: model=${provider.model}`);
        return provider;
  }

  console.warn(`[llm-provider] Unknown BRAIN_PROVIDER="${providerType}" — falling back to Mock`);
    return null;
}
