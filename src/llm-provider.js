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
        '  "detected_stage": "string — current conversation stage (Opening, Qualifying, Offering, Closing, Closed)",',
        '  "next_stage": "string — stage the conversation should move to after this reply",',
        '  "extracted_fields": { "field_name": "value" } — any info extracted from the message (name, phone, product, etc.)',
        '  "recommended_offer": "string or null — if applicable",',
        '  "handoff_required": true/false — whether this needs a human agent,',
        '  "handoff_reason": "string — reason for handoff, empty string if not needed",',
        '  "confidence": 0.0 to 1.0 — how confident you are in your assessment,',
        '  "notes": "string — internal notes for logging"',
        '}',
        '',
        'Rules:',
        '- Always reply in Egyptian Arabic.',
        '- If the customer asks for a human or the topic is sensitive/unclear, set handoff_required=true.',
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

      const response = await axios.post(
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

      const parts = response.data?.candidates?.[0]?.content?.parts;
        const content = Array.isArray(parts) ? parts.map((p) => p?.text || '').join('').trim() : '';
        if (!content) {
                throw new Error('Gemini returned empty content');
        }

      return JSON.parse(content);
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
