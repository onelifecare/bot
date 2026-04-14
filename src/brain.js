function normalizeText(value) {
  return String(value || '').trim();
}

function mergeExtractedFields(baseState, extracted) {
  const next = { ...(baseState || {}) };
  for (const [k, v] of Object.entries(extracted || {})) {
    next[k] = v;
  }
  return next;
}

function detectIntent(text) {
  const t = text.toLowerCase();
  if (!t) return 'empty';
  if (/\b(عايز|اريد|abdo|buy|سعر|عرض|كورس)\b/i.test(t)) return 'buy_intent';
  if (/(احجز|طلب|العنوان|رقم|فون|تليفون|phone)/i.test(t)) return 'booking_data';
  if (/(دكتور|سكر|ضغط|حامل|مرض|عملية|نزيف|سرطان)/i.test(t)) return 'sensitive_health';
  if (/(انسان|موظف|حد من الفريق|كلموني|human)/i.test(t)) return 'request_human';
  if (/(اهلا|السلام|هاي|hi|hello)/i.test(t)) return 'greeting';
  return 'general';
}

function extractBasicFields(text) {
  const extracted = {};
  const phoneMatch = text.match(/(?:\+?2)?01[0-2,5]{1}[0-9]{8}/);
  if (phoneMatch) extracted.phone_1 = phoneMatch[0];

  const govList = [
    'القاهرة', 'الجيزة', 'الإسكندرية', 'القليوبية', 'الشرقية', 'المنوفية', 'الغربية', 'الدقهلية'
  ];
  const gov = govList.find((g) => text.includes(g));
  if (gov) extracted.governorate = gov;

  return extracted;
}

function chooseOffer(offers, text) {
  const activeOffers = (offers || []).filter((o) => String(o.Active || '').toLowerCase() === 'yes');
  if (!activeOffers.length) return null;

  const mentioned = activeOffers.find((o) => text.includes(String(o.Customer_Offer_Name || '')) || text.includes(String(o.Offer_Name || '')));
  if (mentioned) return {
    offer_code: mentioned.Offer_Code || '',
    customer_offer_name: mentioned.Customer_Offer_Name || mentioned.Offer_Name || ''
  };

  const first = activeOffers[0];
  return {
    offer_code: first.Offer_Code || '',
    customer_offer_name: first.Customer_Offer_Name || first.Offer_Name || ''
  };
}

export async function decideWithBrain({ messageText, state, context }) {
  const text = normalizeText(messageText);
  const intent = detectIntent(text);
  const extracted_fields = extractBasicFields(text);
  const recommended_offer = chooseOffer(context?.offers, text);

  let handoff_required = false;
  let handoff_reason = '';
  let confidence = 0.72;
  let detected_stage = state?.chat_stage || 'Opening';
  let next_stage = detected_stage;
  let reply_text = 'تمام يا فندم 👌 وصلتني رسالتك، وهنكمل معاك خطوة بخطوة لحد أنسب اختيار ليك.';

  if (intent === 'greeting') {
    reply_text = 'أهلاً بيك 👋 ابعتلي هدفك قد إيه كيلو وهنظبطلك أنسب عرض.';
    next_stage = 'Opening';
    confidence = 0.88;
  }

  if (intent === 'buy_intent' && recommended_offer) {
    reply_text = `ممتاز 🙌 الأنسب مبدئيًا ليك هو ${recommended_offer.customer_offer_name}. لو تحب أكمل معاك التفاصيل والحجز.`;
    next_stage = 'Recommendation';
    confidence = 0.84;
  }

  if (intent === 'booking_data') {
    next_stage = 'Booking';
    reply_text = 'تمام جدًا ✅ ابعتلي الاسم + رقم الموبايل + المحافظة + العنوان بالتفصيل عشان نأكد الطلب.';
    confidence = 0.82;
  }

  if (intent === 'request_human') {
    handoff_required = true;
    handoff_reason = 'Customer_Requested';
    reply_text = 'حاضر ❤️ هحولك دلوقتي لحد من الفريق يكمل معاك.';
    confidence = 0.95;
  }

  if (intent === 'sensitive_health') {
    handoff_required = true;
    handoff_reason = 'Sensitive_Health';
    reply_text = 'سلامتك أهم حاجة عندنا ❤️ هحولك لزميل مختص يكمل معاك بشكل آمن.';
    confidence = 0.94;
    next_stage = 'Closed';
  }

  if (!text || text.length < 2) {
    handoff_required = true;
    handoff_reason = 'Low_Clarity';
    reply_text = 'محتاج بس توضيح بسيط عشان أساعدك بدقة، وهحوّلك لحد من الفريق يكمل معاك.';
    confidence = 0.4;
  }

  const merged = mergeExtractedFields(state?.collected_fields || {}, extracted_fields);

  return {
    reply_text,
    intent,
    detected_stage,
    next_stage,
    extracted_fields: merged,
    recommended_offer,
    handoff_required,
    handoff_reason,
    confidence,
    notes: {
      provider: 'mock_brain_v1',
      used_tabs: Object.keys(context || {}),
      message_length: text.length
    }
  };
}
