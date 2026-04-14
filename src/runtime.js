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

export async function processIncomingText({ event, config, sheetClient }) {
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

  /* --- Phase 2: delegate to brain --- */
  const collectedFields = parseJsonSafe(chatRow.Collected_Fields_JSON, {});

  const brain = await decideWithBrain({
        messageText: event.text,
        state: {
                chat_stage: chatRow.Chat_Stage || 'Opening',
                collected_fields: collectedFields,
                is_new_chat: isNewChat
        },
        context: {}
  });

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
                Last_Action: brain.handoff_required ? 'ai_handoff' : 'ai_reply_sent',
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
