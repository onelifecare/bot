/**
 * AI Brain abstraction (Phase 2 - architecture patch)
 *
 * الهدف: واجهة موحدة يمكن توصيلها بمزوّد AI حقيقي لاحقًا بدون تعديل runtime.
 */

function safeText(value) {
  return String(value || '').trim();
}

function extractBasicStateHints(messageText, previousFields) {
  const hints = { ...(previousFields || {}) };
  const text = safeText(messageText);

  const phone = text.match(/(?:\+?2)?01[0-2,5]{1}[0-9]{8}/);
  if (phone) hints.phone_1 = phone[0];

  return hints;
}

function buildContextSummary(context) {
  const safe = context || {};
  return {
    pages_count: (safe.pages || []).length,
    offers_count: (safe.offers || []).length,
    products_count: (safe.products || []).length,
    messages_count: (safe.messages || []).length,
    variants_count: (safe.variants || []).length,
    healthgate_count: (safe.healthGate || []).length,
    shipping_rules_count: (safe.shippingRules || []).length,
    training_count: (safe.training || []).length
  };
}

function normalizeDecision(raw, fallback) {
  return {
    reply_text: safeText(raw?.reply_text) || fallback.reply_text,
    intent: safeText(raw?.intent) || fallback.intent,
    detected_stage: safeText(raw?.detected_stage) || fallback.detected_stage,
    next_stage: safeText(raw?.next_stage) || fallback.next_stage,
    extracted_fields: raw?.extracted_fields || fallback.extracted_fields,
    recommended_offer: raw?.recommended_offer || fallback.recommended_offer,
    handoff_required: Boolean(raw?.handoff_required),
    handoff_reason: safeText(raw?.handoff_reason),
    confidence: Number(raw?.confidence ?? fallback.confidence),
    notes: raw?.notes || fallback.notes
  };
}

class MockBrainProvider {
  constructor({ providerName = 'mock_provider_v2' } = {}) {
    this.providerName = providerName;
  }

  async decide(payload) {
    const messageText = safeText(payload?.message_text);
    const previousFields = payload?.state?.collected_fields || {};
    const extracted = extractBasicStateHints(messageText, previousFields);

    const askHuman = /انسان|موظف|اكلم حد|human/i.test(messageText);
    const looksSensitive = /عملية|نزيف|حامل|خطر|سكر|ضغط/i.test(messageText);

    if (askHuman || looksSensitive || messageText.length < 2) {
      return {
        reply_text: 'حاضر ❤️ هحولك فورًا لحد من الفريق المختص يكمل معاك.',
        intent: askHuman ? 'request_human' : 'sensitive_or_unclear',
        detected_stage: payload?.state?.chat_stage || 'Opening',
        next_stage: 'Closed',
        extracted_fields: extracted,
        recommended_offer: null,
        handoff_required: true,
        handoff_reason: askHuman ? 'Customer_Requested' : 'Sensitive_Or_Unclear',
        confidence: 0.65,
        notes: {
          provider: this.providerName,
          mock: true,
          reason: 'safe_handoff_path'
        }
      };
    }

    return {
      reply_text: 'أهلاً بيك 👋 أنا معاك. قولي هدفك كام كيلو وعايز توصل لإيه، وأنا أرشحلك الأنسب.',
      intent: 'ai_general',
      detected_stage: payload?.state?.chat_stage || 'Opening',
      next_stage: payload?.state?.chat_stage || 'Opening',
      extracted_fields: extracted,
      recommended_offer: null,
      handoff_required: false,
      handoff_reason: '',
      confidence: 0.55,
      notes: {
        provider: this.providerName,
        mock: true,
        context_summary: buildContextSummary(payload?.business_context)
      }
    };
  }
}

function buildBrainInput({ messageText, state, context }) {
  return {
    message_text: safeText(messageText),
    state: {
      chat_stage: state?.chat_stage || 'Opening',
      collected_fields: state?.collected_fields || {},
      is_new_chat: Boolean(state?.is_new_chat)
    },
    business_context: context || {}
  };
}

export async function decideWithBrain({ messageText, state, context, provider }) {
  const fallback = {
    reply_text: 'تمام يا فندم 🙏 وصلتني رسالتك.',
    intent: 'fallback',
    detected_stage: state?.chat_stage || 'Opening',
    next_stage: state?.chat_stage || 'Opening',
    extracted_fields: state?.collected_fields || {},
    recommended_offer: null,
    handoff_required: false,
    handoff_reason: '',
    confidence: 0.3,
    notes: { provider: 'fallback', mock: true }
  };

  const activeProvider = provider || new MockBrainProvider();
  const input = buildBrainInput({ messageText, state, context });

  try {
    const raw = await activeProvider.decide(input);
    return normalizeDecision(raw, fallback);
  } catch (error) {
    return normalizeDecision({
      ...fallback,
      notes: {
        ...fallback.notes,
        error: error.message
      }
    }, fallback);
  }
}

export function createMockBrainProvider() {
  return new MockBrainProvider();
}
