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
