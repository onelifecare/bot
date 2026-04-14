import { sendTextMessage } from './messenger.js';
import { decideWithBrain } from './brain.js';

function nowIso() {
  return new Date().toISOString();
}

function isOn(value) {
  return String(value || '').trim().toLowerCase() === 'on';
}

function isYes(value) {
  return String(value || '').trim().toLowerCase() === 'yes';
}

function parseJsonSafe(text, fallback) {
  try {
    return text ? JSON.parse(text) : fallback;
  } catch {
    return fallback;
  }
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

function normalizeBrainResult(brainResult, isNewChat, greetingText) {
  const fallbackReply = isNewChat
    ? greetingText
    : 'تمام يا فندم 🙏 وضّحلي بس تفاصيل أكتر عشان أساعدك بدقة.';

  return {
    reply_text: String(brainResult?.reply_text || fallbackReply),
    intent: brainResult?.intent || 'general',
    detected_stage: brainResult?.detected_stage || 'Opening',
    next_stage: brainResult?.next_stage || brainResult?.detected_stage || 'Opening',
    extracted_fields: brainResult?.extracted_fields || {},
    recommended_offer: brainResult?.recommended_offer || null,
    handoff_required: Boolean(brainResult?.handoff_required),
    handoff_reason: brainResult?.handoff_reason || '',
    confidence: Number(brainResult?.confidence ?? 0),
    notes: brainResult?.notes || {}
  };
}

export async function processIncomingText({ event, config, sheetClient }) {
  const pageId = event.pageId;
  const threadId = event.senderPsid;

  const page = await sheetClient.getPageById(pageId);
  if (!page || String(page.Page_Status).trim().toLowerCase() !== 'active') {
    await sheetClient.appendActionLog({
      entity: 'runtime',
      action: 'page_inactive_or_missing',
      threadId,
      reason: 'Page missing or not Active',
      meta: { pageId }
    });
    return { stopped: true, reason: 'page_inactive_or_missing' };
  }

  if (!isOn(page.AI_Page)) {
    await sheetClient.appendActionLog({
      entity: 'runtime',
      action: 'page_ai_off',
      threadId,
      reason: 'Pages.AI_Page != ON',
      meta: { pageId }
    });
    return { stopped: true, reason: 'page_ai_off' };
  }

  const botControl = await sheetClient.getBotControlByPageId(pageId);
  if (!botControl || !isYes(botControl.AI_Enabled)) {
    await sheetClient.appendActionLog({
      entity: 'runtime',
      action: 'ai_disabled',
      threadId,
      reason: 'BotControl missing or AI_Enabled != Yes',
      meta: { pageId }
    });
    return { stopped: true, reason: 'ai_disabled' };
  }

  const existingChat = await sheetClient.getChatControlByThreadAndPage({ threadId, pageId });
  if (existingChat && !isOn(existingChat.AI_Chat)) {
    await sheetClient.appendActionLog({
      entity: 'runtime',
      action: 'chat_ai_off',
      threadId,
      reason: 'ChatControl.AI_Chat != ON',
      meta: { pageId }
    });
    return { stopped: true, reason: 'chat_ai_off', isNewChat: false };
  }

  const isNewChat = !existingChat;
  const baseRow = isNewChat
    ? buildNewChatRow({ threadId, pageId })
    : {
        ...existingChat,
        Last_Action: 'ai_intake',
        Last_Updated_At: nowIso()
      };

  await sheetClient.upsertChatControl({ row: baseRow });

  const currentState = parseJsonSafe(baseRow.Collected_Fields_JSON, {});
  const aiContext = await sheetClient.loadAiContext({ pageId, threadId });

  const brainRaw = await decideWithBrain({
    messageText: event.text,
    state: {
      chat_stage: baseRow.Chat_Stage || 'Opening',
      collected_fields: currentState,
      is_new_chat: isNewChat
    },
    context: aiContext
  });

  const brain = normalizeBrainResult(brainRaw, isNewChat, config.greetingText);

  if (brain.handoff_required) {
    const handoffId = await sheetClient.createHandoff({
      pageId,
      threadId,
      reasonType: brain.handoff_reason || 'Runtime_Handoff',
      reasonNote: `intent=${brain.intent}; confidence=${brain.confidence}`,
      customerName: existingChat?.Customer_Name || '',
      phone1: existingChat?.Phone_1 || ''
    });

    await sheetClient.updateChatControlByThreadAndPage({
      pageId,
      threadId,
      updates: {
        AI_Chat: 'OFF',
        AI_Chat_OFF_Reason: brain.handoff_reason || 'AI_Handoff',
        Chat_Stage: 'Closed',
        Handoff_ID: handoffId,
        Last_Action: 'ai_handoff',
        Last_Updated_At: nowIso()
      }
    });

    await sendTextMessage({
      pageAccessToken: page.Page_Access_Token,
      recipientPsid: threadId,
      text: brain.reply_text || 'لحظة يا فندم ❤️ هحولك لحد من الفريق يكمل معاك.'
    });

    await sheetClient.appendActionLog({
      entity: 'runtime',
      action: 'ai_handoff',
      threadId,
      reason: brain.handoff_reason || 'AI_Handoff',
      meta: { pageId, brain }
    });

    return { stopped: false, handoff: true, handoffId };
  }

  const nextCollected = JSON.stringify(brain.extracted_fields || {});
  await sheetClient.updateChatControlByThreadAndPage({
    pageId,
    threadId,
    updates: {
      Chat_Stage: brain.next_stage || baseRow.Chat_Stage || 'Opening',
      Collected_Fields_JSON: nextCollected,
      Last_Action: 'ai_reply_sent',
      Last_Updated_At: nowIso()
    }
  });

  await sendTextMessage({
    pageAccessToken: page.Page_Access_Token,
    recipientPsid: threadId,
    text: brain.reply_text
  });

  await sheetClient.appendActionLog({
    entity: 'runtime',
    action: isNewChat ? 'phase2_ai_first_reply' : 'phase2_ai_reply',
    threadId,
    meta: {
      pageId,
      intent: brain.intent,
      detected_stage: brain.detected_stage,
      next_stage: brain.next_stage,
      confidence: brain.confidence,
      recommended_offer: brain.recommended_offer
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
