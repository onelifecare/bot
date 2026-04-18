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

function normalizeArabic(value) {
    return String(value || '')
        .replace(/[\u0623\u0625\u0622]/g, '\u0627') // أ/إ/آ → ا
        .replace(/\u0649/g, '\u064A')               // ى → ي
        .replace(/\u0629/g, '\u0647')               // ة → ه
        .replace(/\u0640/g, '')                     // tatweel ـ
        .replace(/[\u064B-\u0652]/g, '')            // tashkeel
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function extractBasicHints(text, previousFields) {
    const hints = { ...(previousFields || {}) };
    const phone = text.match(/(?:\+?2)?01[0-2,5]{1}[0-9]{8}/);
    if (phone) hints.phone_1 = phone[0];
    return hints;
}

function coerceObjectField(value) {
    if (value == null) return null;
    if (typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return null;
        try {
            const parsed = JSON.parse(trimmed);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
        } catch {
            return null;
        }
    }
    return null;
}

function coerceOfferField(value) {
    if (value == null) return null;
    if (typeof value === 'string') return value;
    try { return JSON.stringify(value); } catch { return String(value); }
}

function normalizeDecision(raw, fallback) {
    return {
          reply_text: safeText(raw?.reply_text) || fallback.reply_text,
          intent: safeText(raw?.intent) || fallback.intent,
          detected_stage: safeText(raw?.detected_stage) || fallback.detected_stage,
          next_stage: safeText(raw?.next_stage) || fallback.next_stage,
          extracted_fields: coerceObjectField(raw?.extracted_fields) || fallback.extracted_fields,
          recommended_offer: raw?.recommended_offer === undefined ? fallback.recommended_offer : coerceOfferField(raw?.recommended_offer),
          handoff_required: Boolean(raw?.handoff_required),
          handoff_reason: safeText(raw?.handoff_reason),
          confidence: Number(raw?.confidence ?? fallback.confidence),
          notes: raw?.notes ?? fallback.notes
    };
}

/* ---------- Mock provider (temporary, replaceable) ---------- */

class MockBrainProvider {
    constructor({ providerName = 'mock_v1' } = {}) {
          this.providerName = providerName;
    }

  async decide(payload) {
        const text = safeText(payload?.message_text);
        const normalized = normalizeArabic(text);
        const prev = payload?.state?.collected_fields || {};
        const extracted = extractBasicHints(text, prev);
        const stage = payload?.state?.chat_stage || 'Opening';

      const wantsHuman = /انسان|موظف|اكلم|اتكلم|فريق|الدعم|ممثل|human|agent/i.test(normalized);
        // Rescue Pass: "ضغط" alone is NOT a sensitive keyword — generic
        // pressure mentions are caught by isGenericPressureMessage() in
        // runtime.js and routed to a clarifier. Specific pressure cases
        // (e.g. "ضغط عالي متقطع") reach the brain and can still be
        // classified as sensitive via qualifiers like "نزيف"/"حامل".
        const sensitive = /عمليه|نزيف|حامل|خطر|سكر/i.test(normalized);
        const wantsOffers = /عرض|عروض|باقه|باقات|سعر|اسعار|اشتراك|تكلفه|كام/i.test(normalized);
        const wantsFollowup = /تفاصيل|اكتر|كمان|زياده|توضيح|ايضاح|فهمت|اشرح/i.test(normalized);

      if (wantsHuman || sensitive || text.length < 2) {
              return {
                        reply_text: 'حاضر، هحوّلك دلوقتي لحد من الفريق يكمل معاك.',
                        intent: wantsHuman ? 'request_human' : 'sensitive_or_unclear',
                        detected_stage: stage,
                        next_stage: 'Closed',
                        extracted_fields: extracted,
                        recommended_offer: null,
                        handoff_required: true,
                        handoff_reason: wantsHuman ? 'Customer_Requested' : 'Sensitive_Or_Unclear',
                        confidence: 0.7,
                        notes: { provider: this.providerName, mock: true }
              };
      }

      if (wantsOffers) {
              return {
                        reply_text: 'عندنا عروض وباقات مناسبة حسب احتياجك. ممكن تقولي الخدمة اللي تهمّك والمنطقة ورقم موبايلك عشان أبعتلك التفاصيل المناسبة؟',
                        intent: 'offers_inquiry',
                        detected_stage: stage,
                        next_stage: stage,
                        extracted_fields: extracted,
                        recommended_offer: null,
                        handoff_required: false,
                        handoff_reason: '',
                        confidence: 0.6,
                        notes: { provider: this.providerName, mock: true }
              };
      }

      if (wantsFollowup) {
              return {
                        reply_text: 'أكيد، حابب تعرف تفاصيل عن إيه بالظبط — الأسعار، المواعيد، ولا طريقة الحجز؟',
                        intent: 'followup_clarify',
                        detected_stage: stage,
                        next_stage: stage,
                        extracted_fields: extracted,
                        recommended_offer: null,
                        handoff_required: false,
                        handoff_reason: '',
                        confidence: 0.55,
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
        const providerName = activeProvider?.providerName || 'unknown';
        console.error(`[brain] provider_error provider=${providerName} message=${err.message}`);
        return normalizeDecision({ ...fallback, notes: { ...fallback.notes, error: err.message, provider: providerName } }, fallback);
  }
}

export function createMockBrainProvider() {
    return new MockBrainProvider();
}
