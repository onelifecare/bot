/**
 * AI Brain abstraction (Phase 2 - architecture patch)
 *
 * Stable contract: decideWithBrain({ messageText, state, context, provider })
 * Provider interface: { async decide(payload) => BrainDecision }
 * Mock provider ships as the default until a real AI provider is wired.
 */

function safeText(value) {
    return String(value || '').trim();
}

function extractBasicHints(text, previousFields) {
    const hints = { ...(previousFields || {}) };
    const phone = text.match(/(?:\+?2)?01[0-2,5]{1}[0-9]{8}/);
    if (phone) hints.phone_1 = phone[0];
    return hints;
}

function normalizeDecision(raw, fallback) {
    return {
          reply_text: safeText(raw?.reply_text) || fallback.reply_text,
          intent: safeText(raw?.intent) || fallback.intent,
          detected_stage: safeText(raw?.detected_stage) || fallback.detected_stage,
          next_stage: safeText(raw?.next_stage) || fallback.next_stage,
          extracted_fields: raw?.extracted_fields || fallback.extracted_fields,
          recommended_offer: raw?.recommended_offer ?? fallback.recommended_offer,
          handoff_required: Boolean(raw?.handoff_required),
          handoff_reason: safeText(raw?.handoff_reason),
          confidence: Number(raw?.confidence ?? fallback.confidence),
          notes: raw?.notes || fallback.notes
    };
}

/* ---------- Mock provider (temporary, replaceable) ---------- */

class MockBrainProvider {
    constructor({ providerName = 'mock_v1' } = {}) {
          this.providerName = providerName;
    }

  async decide(payload) {
        const text = safeText(payload?.message_text);
        const prev = payload?.state?.collected_fields || {};
        const extracted = extractBasicHints(text, prev);
        const stage = payload?.state?.chat_stage || 'Opening';

      const wantsHuman = /انسان|موظف|اكلم حد|human/i.test(text);
        const sensitive = /عملية|نزيف|حامل|خطر|سكر|ضغط/i.test(text);

      if (wantsHuman || sensitive || text.length < 2) {
              return {
                        reply_text: 'حاضر هحولك لحد من الفريق يكمل معاك.',
                        intent: wantsHuman ? 'request_human' : 'sensitive_or_unclear',
                        detected_stage: stage,
                        next_stage: 'Closed',
                        extracted_fields: extracted,
                        recommended_offer: null,
                        handoff_required: true,
                        handoff_reason: wantsHuman ? 'Customer_Requested' : 'Sensitive_Or_Unclear',
                        confidence: 0.65,
                        notes: { provider: this.providerName, mock: true }
              };
      }

      return {
              reply_text: 'أهلاً بيك، أنا معاك. قولي محتاج إيه وأنا أساعدك.',
              intent: 'ai_general',
              detected_stage: stage,
              next_stage: stage,
              extracted_fields: extracted,
              recommended_offer: null,
              handoff_required: false,
              handoff_reason: '',
              confidence: 0.5,
              notes: { provider: this.providerName, mock: true }
      };
  }
}

/* ---------- Public API ---------- */

export async function decideWithBrain({ messageText, state, context, provider }) {
    const fallback = {
          reply_text: 'وصلتني رسالتك، لحظة.',
          intent: 'fallback',
          detected_stage: state?.chat_stage || 'Opening',
          next_stage: state?.chat_stage || 'Opening',
          extracted_fields: state?.collected_fields || {},
          recommended_offer: null,
          handoff_required: false,
          handoff_reason: '',
          confidence: 0,
          notes: { provider: 'fallback', mock: true }
    };

  const activeProvider = provider || new MockBrainProvider();

  try {
        const raw = await activeProvider.decide({
                message_text: safeText(messageText),
                state: {
                          chat_stage: state?.chat_stage || 'Opening',
                          collected_fields: state?.collected_fields || {},
                          is_new_chat: Boolean(state?.is_new_chat)
                },
                business_context: context || {}
        });
        return normalizeDecision(raw, fallback);
  } catch (err) {
        return normalizeDecision({ ...fallback, notes: { ...fallback.notes, error: err.message } }, fallback);
  }
}

export function createMockBrainProvider() {
    return new MockBrainProvider();
}
