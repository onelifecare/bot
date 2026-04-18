import { sendTextMessage } from './messenger.js';
import { decideWithBrain } from './brain.js';

/*
 * Stage transition table — verbatim from the LLM prompt at
 * src/llm-provider.js:56-63. Do not add or invent new transitions here;
 * this file is a runtime enforcer of the prompt's declared rules.
 */
const ALLOWED_NEXT_STAGES = {
      Opening:        ['Opening', 'Diagnosis', 'Objection', 'Closed'],
      Diagnosis:      ['Diagnosis', 'Recommendation', 'Objection', 'Closed'],
      Recommendation: ['Recommendation', 'Objection', 'Booking', 'Diagnosis', 'Closed'],
      Objection:      ['Opening', 'Diagnosis', 'Recommendation', 'Booking', 'Closed'],
      Booking:        ['Booking', 'PostSend', 'Objection', 'Closed'],
      PostSend:       ['PostSend', 'Closed'],
      Closed:         ['Closed']
};

function enforceStageTransition(currentStage, proposedNextStage, handoffRequired) {
      const from = ALLOWED_NEXT_STAGES[currentStage] ? currentStage : 'Opening';
      const to = String(proposedNextStage || '').trim();

      if (handoffRequired) {
            return { stage: 'Closed', rejected: false, from, to };
      }

      if (!to) {
            return { stage: from, rejected: true, reason: 'empty_next_stage', from, to };
      }

      const allowed = ALLOWED_NEXT_STAGES[from] || [];
      if (allowed.includes(to)) {
            return { stage: to, rejected: false, from, to };
      }

      return { stage: from, rejected: true, reason: 'transition_not_allowed', from, to };
}

function nowIso() {
      return new Date().toISOString();
}

/*
 * P2.6 — Incomplete Output Guard.
 *
 * Detects when the brain output is structurally complete (no exception
 * thrown by the provider) but semantically unusable. Two cases only:
 *
 *   1) reply_text collapsed to brain.js's fallback literal. This is the
 *      definitive signature of a Gemini partial_extract that did not
 *      recover reply_text — normalizeDecision() then filled the slot
 *      with the fallback Arabic sentence and the customer sees it.
 *      The literal MUST stay in sync with the fallback in brain.js
 *      (decideWithBrain → const fallback).
 *
 *   2) Stage is (or is moving into) Recommendation, offers were loaded,
 *      but recommended_offer is empty. Per the doctrine, Recommendation
 *      without a chosen offer is incomplete by definition.
 *
 * Returns { incomplete: bool, reason: string }. Reason codes:
 *   - reply_text_fallback_literal
 *   - recommendation_without_offer
 */
const FALLBACK_REPLY_LITERAL = 'وصلتني رسالتك، لحظة.';

function detectIncompleteBrainOutput({ brain, currentStage, proposedNextStage, offersCount }) {
      const replyText = String(brain && brain.reply_text || '').trim();
      if (replyText === FALLBACK_REPLY_LITERAL || replyText === '') {
            return { incomplete: true, reason: 'reply_text_fallback_literal' };
      }

      const stageIsRecommendation =
            String(proposedNextStage || '').trim() === 'Recommendation' ||
            String(currentStage || '').trim() === 'Recommendation';
      const recommendedOffer = String(brain && brain.recommended_offer || '').trim();
      if (stageIsRecommendation && offersCount > 0 && !recommendedOffer) {
            return { incomplete: true, reason: 'recommendation_without_offer' };
      }

      return { incomplete: false, reason: '' };
}

function buildNewChatRow({ threadId, pageId }) {
      return {
              Thread_ID: threadId,
              Page_ID: pageId,
              AI_Chat: 'ON',
              Chat_Stage: 'Opening',
              Last_Action: 'intake_first',
              Collected_Fields_JSON: '{}',
              Is_Archived: 'No',
              Last_Updated_At: nowIso()
      };
}

function isOn(value) {
      return String(value || '').trim().toLowerCase() === 'on';
}

function isYes(value) {
      return String(value || '').trim().toLowerCase() === 'yes';
}

function parseJsonSafe(text, fallback) {
      try { return text ? JSON.parse(text) : fallback; }
      catch { return fallback; }
}

/*
 * Rescue Pass — generic blood-pressure detector.
 *
 * Catches messages that merely mention pressure without any qualifier
 * (high/low, regular/irregular, on meds, etc.) or any other concurrent
 * sensitive condition. Those messages should NOT be routed as a
 * sensitive-health handoff; the operator must ask the customer a
 * clarifying question first. Specific cases ("ضغطي عالي متقطع",
 * "ضغط + حامل") fall through to the normal brain path untouched so
 * the existing sensitive routing in the brain still applies.
 *
 * Deliberately narrow: must contain a pressure token AND must not
 * contain any disqualifier. No medical logic beyond the token list.
 */
function isGenericPressureMessage(text) {
      const t = String(text || '').trim();
      if (!t) return false;
      if (!/(?:^|[^\p{L}])(?:ال)?ضغط(?:ي|ى)?(?:[^\p{L}]|$)/u.test(t)) return false;
      const disqualifiers = /عالي|عالى|مرتفع|منخفض|واطي|واطى|هابط|متقطع|منتظم|مش\s*منتظم|علاج|دوا|دواء|أدوية|ادوية|حبوب|كبسولات|نزيف|حامل|حمل|سكر|قلب|كلى|كبد|جلطه|جلطة|سكتة|سكته|عمليه|عملية|خطر|حاله\s*خاصه|حالة\s*خاصة/i;
      if (disqualifiers.test(t)) return false;
      return true;
}

const PRESSURE_CLARIFIER_TEXT = 'حضرتك الضغط عندك عالي ولا منخفض؟ ومنتظم ولا بيتقطع؟ وعلى علاج منتظم ولا لأ؟';

export async function processIncomingText({ event, config, sheetClient, brainProvider }) {
      const pageId = event.pageId;
      const threadId = event.senderPsid;

  const page = await sheetClient.getPageById(pageId);
      if (!page || String(page.Page_Status).trim().toLowerCase() !== 'active') {
              await sheetClient.appendActionLog({
                        entity: 'runtime',
                        action: 'page_inactive_or_missing',
                        pageId,
                        threadId,
                        reason: 'Page missing or not Active'
              });
              return { stopped: true, reason: 'page_inactive_or_missing' };
      }

  if (!isOn(page.AI_Page)) {
          await sheetClient.appendActionLog({
                    entity: 'runtime',
                    action: 'page_ai_off',
                    pageId,
                    threadId,
                    reason: 'Pages.AI_Page != ON'
          });
          return { stopped: true, reason: 'page_ai_off' };
  }

  if (!page.Page_Access_Token || !String(page.Page_Access_Token).trim()) {
          await sheetClient.appendActionLog({
                    entity: 'runtime',
                    action: 'page_token_missing',
                    pageId,
                    threadId,
                    reason: 'Pages.Page_Access_Token empty'
          });
          return { stopped: true, reason: 'page_token_missing' };
  }

  const botControl = await sheetClient.getBotControlByPageId(pageId);
      if (!botControl || !isYes(botControl.AI_Enabled)) {
              await sheetClient.appendActionLog({
                        entity: 'runtime',
                        action: 'ai_disabled',
                        pageId,
                        threadId,
                        reason: 'BotControl missing or AI_Enabled != Yes'
              });
              return { stopped: true, reason: 'ai_disabled' };
      }

  const existingChat = await sheetClient.getChatControlByThreadAndPage({ threadId, pageId });
      if (existingChat && !isOn(existingChat.AI_Chat)) {
              await sheetClient.appendActionLog({
                        entity: 'runtime',
                        action: 'chat_ai_off',
                        pageId,
                        threadId,
                        reason: 'ChatControl.AI_Chat != ON'
              });
              return { stopped: true, reason: 'chat_ai_off', isNewChat: false };
      }

  const isNewChat = !existingChat;
      const chatRow = isNewChat
        ? buildNewChatRow({ threadId, pageId })
              : {
                          ...existingChat,
                          Last_Action: 'intake_message',
                          Last_Updated_At: nowIso()
              };

  await sheetClient.upsertChatControl({ row: chatRow });

  /* Rescue Pass — generic-pressure clarifier.
   * Short-circuits before any LLM call: if the customer merely said
   * "ضغط" / "عندي ضغط" / "ضغطي" with no qualifier, we ask for more
   * detail once instead of triggering a sensitive-health handoff.
   * Chat_Stage and AI_Chat are left untouched so the next message
   * flows through the normal brain path. */
  if (isGenericPressureMessage(event.text)) {
          await sendTextMessage({
                    pageAccessToken: page.Page_Access_Token,
                    recipientPsid: threadId,
                    text: PRESSURE_CLARIFIER_TEXT
          });

          await sheetClient.updateRowInTab({
                    tabName: sheetClient.tabs.chatControl,
                    match: (r) => String(r.Page_ID) === String(pageId) && String(r.Thread_ID) === String(threadId),
                    updates: { Last_Action: 'pressure_clarify_asked', Last_Updated_At: nowIso() }
          });

          await sheetClient.appendActionLog({
                    entity: 'runtime',
                    action: 'pressure_clarify_asked',
                    pageId,
                    threadId,
                    reason: 'generic pressure mention — asking clarifier before routing',
                    meta: { current_stage: chatRow.Chat_Stage || 'Opening', text: String(event.text || '').slice(0, 80) }
          });

          return { stopped: false, isNewChat, clarified: true, reason: 'generic_pressure' };
  }

  /* --- Phase 2: build context and delegate to brain --- */
  const collectedFields = parseJsonSafe(chatRow.Collected_Fields_JSON, {});

  /* P2: load real Offers catalog so the brain stops inventing names/prices.
   * Failure is non-fatal — if the Offers tab is missing or unreadable, we
   * log and continue with an empty offers list (legacy behaviour). */
  let offers = [];
  try {
          const rawOffers = await sheetClient.listOffersForPage(pageId);
          offers = (rawOffers || []).slice(0, 12).map((o) => ({
                    Offer_Code: o.Offer_Code || '',
                    Customer_Offer_Name: o.Customer_Offer_Name || o.Offer_Name || '',
                    Public_Weight_Text: o.Public_Weight_Text || '',
                    Price: o.Price || '',
                    Components: o.Components || '',
                    Recommended_For: o.Recommended_For || '',
                    Internal_Recommendation: o.Internal_Recommendation || '',
                    Health_Path: o.Health_Path || ''
          }));
  } catch (err) {
          await sheetClient.appendActionLog({
                    entity: 'runtime',
                    action: 'offers_load_failed',
                    pageId,
                    threadId,
                    reason: String(err && err.message || err).slice(0, 200)
          });
  }

  /* P2.5: resolve persona from Pages.Assigned_Persona_ID. Failure is
   * non-fatal — if the ID is empty, missing, inactive, or the Personas tab
   * is unreadable, we log (when meaningful) and continue with null persona
   * so identity questions fall through to the generic safe fallback. */
  let persona = null;
  const assignedPersonaId = String(page.Assigned_Persona_ID || '').trim();
  if (assignedPersonaId) {
          try {
                    const row = await sheetClient.getPersonaById(assignedPersonaId);
                    if (row) {
                              persona = {
                                        Persona_ID: row.Persona_ID || '',
                                        Persona_Name: row.Persona_Name || '',
                                        Intro_Message: row.Intro_Message || '',
                                        If_Asked_Who_Are_You: row.If_Asked_Who_Are_You || '',
                                        If_Asked_Are_You_Bot: row.If_Asked_Are_You_Bot || '',
                                        Escalation_Message: row.Escalation_Message || '',
                                        Tone_Notes: row.Tone_Notes || ''
                              };
                    } else {
                              await sheetClient.appendActionLog({
                                        entity: 'runtime',
                                        action: 'persona_missing',
                                        pageId,
                                        threadId,
                                        reason: `Assigned_Persona_ID=${assignedPersonaId} not found or inactive`
                              });
                    }
          } catch (err) {
                    await sheetClient.appendActionLog({
                              entity: 'runtime',
                              action: 'persona_load_failed',
                              pageId,
                              threadId,
                              reason: String(err && err.message || err).slice(0, 200)
                    });
          }
  }

  const businessContext = {
          page: { Page_ID: page.Page_ID, Page_Name: page.Page_Name || '', Page_Status: page.Page_Status },
          botControl: { AI_Enabled: botControl.AI_Enabled, Model: botControl.Model || '', Tone: botControl.Tone || '' },
          chat: {
                    Thread_ID: threadId,
                    Chat_Stage: chatRow.Chat_Stage || 'Opening',
                    Is_Archived: chatRow.Is_Archived || 'No',
                    is_new_chat: isNewChat
          },
          offers,
          persona
  };

  const brain = await decideWithBrain({
          messageText: event.text,
          state: {
                    chat_stage: chatRow.Chat_Stage || 'Opening',
                    collected_fields: collectedFields,
                    is_new_chat: isNewChat
          },
          context: businessContext,
            provider: brainProvider
  });

    /* --- Handoff path --- */
        if (brain.handoff_required) {
                  /* Extract customer info from collected fields when available */
                  const customerName = collectedFields.customer_name || collectedFields.name || '';
                  const phone1 = collectedFields.phone || collectedFields.phone_1 || '';

                  await sheetClient.appendHandoff({
                              pageId,
                              threadId,
                              reason: brain.handoff_reason || 'AI_Handoff',
                              reasonNote: `intent=${brain.intent}; confidence=${brain.confidence}`,
                              customerName,
                              phone1
                  });

                  /* Turn AI off and record reason (existing behavior) */
                  await sheetClient.updateChatAiByThreadAndPage({
                              pageId,
                              threadId,
                              value: 'OFF',
                              reason: brain.handoff_reason || 'AI_Handoff'
                  });

                  /* Update ChatControl runtime fields: Last_Action + Last_Updated_At */
                  await sheetClient.updateRowInTab({
                              tabName: sheetClient.tabs.chatControl,
                              match: (r) => String(r.Page_ID) === String(pageId) && String(r.Thread_ID) === String(threadId),
                              updates: { Last_Action: 'handoff', Last_Updated_At: nowIso() }
                  });

                  const handoffText = brain.reply_text || config.greetingText;
                  await sendTextMessage({
                              pageAccessToken: page.Page_Access_Token,
                              recipientPsid: threadId,
                              text: handoffText
                  });

                  await sheetClient.appendActionLog({
                              entity: 'runtime',
                              action: 'brain_handoff',
                              pageId,
                              threadId,
                              reason: brain.handoff_reason || 'AI_Handoff',
                              meta: { intent: brain.intent, confidence: brain.confidence }
                  });

                  return { stopped: false, isNewChat, handoff: true, intent: brain.intent };
        }

  /* --- P2.6: Incomplete Output Guard ---
   * Reuses the existing handoff machinery when the brain returned a
   * structurally complete object whose reply or recommendation is
   * actually unusable. AI_Chat goes OFF for this thread (so we stop
   * spamming the generic fallback), a Handoffs row is opened for the
   * human team, and Chat_Stage is preserved at its previous valid
   * value (we do NOT advance into Recommendation/Booking on incomplete
   * output). */
  const incompleteCheck = detectIncompleteBrainOutput({
          brain,
          currentStage: chatRow.Chat_Stage || 'Opening',
          proposedNextStage: brain.next_stage,
          offersCount: offers.length
  });

  if (incompleteCheck.incomplete) {
          const customerName = collectedFields.customer_name || collectedFields.name || '';
          const phone1 = collectedFields.phone || collectedFields.phone_1 || '';
          const previousStage = chatRow.Chat_Stage || 'Opening';

          await sheetClient.appendActionLog({
                    entity: 'runtime',
                    action: 'brain_output_incomplete',
                    pageId,
                    threadId,
                    reason: incompleteCheck.reason,
                    meta: {
                              current_stage: previousStage,
                              proposed_stage: brain.next_stage || '',
                              offers_count: offers.length,
                              persona_id: persona ? persona.Persona_ID : '',
                              recommended_offer: brain.recommended_offer || '',
                              intent: brain.intent || '',
                              confidence: brain.confidence,
                              reply_was_fallback: incompleteCheck.reason === 'reply_text_fallback_literal'
                    }
          });

          await sheetClient.appendHandoff({
                    pageId,
                    threadId,
                    reason: 'Incomplete_AI_Output',
                    reasonNote: `code=${incompleteCheck.reason}; stage=${previousStage}->${brain.next_stage || ''}; offers=${offers.length}; rec=${brain.recommended_offer || ''}`,
                    customerName,
                    phone1
          });

          await sheetClient.updateChatAiByThreadAndPage({
                    pageId,
                    threadId,
                    value: 'OFF',
                    reason: 'Incomplete_AI_Output'
          });

          await sheetClient.updateRowInTab({
                    tabName: sheetClient.tabs.chatControl,
                    match: (r) => String(r.Page_ID) === String(pageId) && String(r.Thread_ID) === String(threadId),
                    updates: { Last_Action: 'handoff_incomplete', Last_Updated_At: nowIso() }
          });

          const handoffText = (persona && persona.Escalation_Message) || config.greetingText;
          await sendTextMessage({
                    pageAccessToken: page.Page_Access_Token,
                    recipientPsid: threadId,
                    text: handoffText
          });

          return {
                    stopped: false,
                    isNewChat,
                    handoff: true,
                    incomplete: true,
                    reason: incompleteCheck.reason
          };
  }

  /* --- Normal AI reply path --- */
  const replyText = brain.reply_text || config.greetingText;

  await sendTextMessage({
          pageAccessToken: page.Page_Access_Token,
          recipientPsid: threadId,
          text: replyText
  });

  const guard = enforceStageTransition(
          chatRow.Chat_Stage || 'Opening',
          brain.next_stage,
          brain.handoff_required
  );

  if (guard.rejected) {
          await sheetClient.appendActionLog({
                    entity: 'runtime',
                    action: 'stage_guard_reject',
                    pageId,
                    threadId,
                    reason: guard.reason,
                    meta: { from: guard.from, to: guard.to, intent: brain.intent }
          });
  }

  await sheetClient.upsertChatControl({
          row: {
                    ...chatRow,
                    Chat_Stage: guard.stage,
                    Collected_Fields_JSON: JSON.stringify(brain.extracted_fields || {}),
                    Last_Action: 'ai_reply_sent',
                    Last_Updated_At: nowIso()
          }
  });

  await sheetClient.appendActionLog({
          entity: 'runtime',
          action: isNewChat ? 'brain_first_reply' : 'brain_reply',
          pageId,
          threadId,
          meta: {
                    intent: brain.intent,
                    next_stage: guard.stage,
                    proposed_stage: brain.next_stage,
                    stage_guard_rejected: guard.rejected,
                    confidence: brain.confidence,
                    handoff_required: brain.handoff_required,
                    recommended_offer: brain.recommended_offer || '',
                    offers_count: offers.length,
                    persona_id: persona ? persona.Persona_ID : ''
          }
  });

  return {
          stopped: false,
          isNewChat,
          replied: true,
          intent: brain.intent,
          nextStage: guard.stage,
          confidence: brain.confidence
  };
}
