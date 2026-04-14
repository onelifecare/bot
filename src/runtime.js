import { sendTextMessage } from './messenger.js';

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

  if (isNewChat) {
    await sendTextMessage({
      pageAccessToken: page.Page_Access_Token,
      recipientPsid: threadId,
      text: config.greetingText
    });

    await sheetClient.appendActionLog({
      entity: 'runtime',
      action: 'phase1_greeting_sent',
      pageId,
      threadId,
      meta: {
        textLen: event.text.length,
        isNewChat: true
      }
    });

    return { stopped: false, isNewChat: true, replied: true };
  }

  await sheetClient.appendActionLog({
    entity: 'runtime',
    action: 'phase1_existing_chat_seen',
    pageId,
    threadId,
    meta: {
      textLen: event.text.length,
      isNewChat: false
    }
  });

  return { stopped: false, isNewChat: false, replied: false };
}
