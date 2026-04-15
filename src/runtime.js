import { sendTextMessage } from './messenger.js';
import { decideWithBrain } from './brain.js';

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

  const businessContext = {
          page: { Page_ID: page.Page_ID, Page_Name: page.Page_Name || '', Page_Status: page.Page_Status },
          botControl: { AI_Enabled: botControl.AI_Enabled, Model: botControl.Model || '', Tone: botControl.Tone || '' },
          chat: {
                    Thread_ID: threadId,
                    Chat_Stage: chatRow.Chat_Stage || 'Opening',
                    Is_Archived: chatRow.Is_Archived || 'No',
                    is_new_chat: isNewChat
          }
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

  await sheetClient.upsertChatControl({
          row: {
                    ...chatRow,
                    Chat_Stage: brain.next_stage || chatRow.Chat_Stage || 'Opening',
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
                    next_stage: brain.next_stage,
                    confidence: brain.confidence,
                    handoff_required: brain.handoff_required
          }
  });

  return {
          stopped: false,
          isNewChat,
          replied: true,
          intent: brain.intent,
          nextStage: brain.next_stage,
          confidence: brain.confidence
  };
}
