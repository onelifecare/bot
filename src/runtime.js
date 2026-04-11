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

export async function processIncomingText({ event, config, sheetClient }) {
  const pageId = event.pageId;
  const threadId = event.senderPsid;

  const page = await sheetClient.getPageById(pageId);
  if (!page || String(page.Page_Status).toLowerCase() !== 'active') {
    await sheetClient.appendActionLog({
      entity: 'runtime',
      action: 'page_inactive_or_missing',
      pageId,
      threadId,
      reason: 'Page missing or not Active'
    });
    return { stopped: true, reason: 'page_inactive_or_missing' };
  }

  const botControl = await sheetClient.getBotControlByPageId(pageId);
  if (!botControl || String(botControl.AI_Enabled).toLowerCase() !== 'yes') {
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
  const chatRow = existingChat
    ? {
        ...existingChat,
        Last_Action: 'intake_message',
        Last_Updated_At: nowIso()
      }
    : buildNewChatRow({ threadId, pageId });

  await sheetClient.upsertChatControl({ row: chatRow });

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
      isNewChat: !existingChat
    }
  });

  return { stopped: false, isNewChat: !existingChat };
}
