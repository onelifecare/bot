import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { isValidSignature } from './messenger.js';
import { SheetClient } from './sheets.js';
import { processIncomingText } from './runtime.js';
import { createBrainProvider } from './llm-provider.js';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    }
  })
);

const sheetClient = new SheetClient({
  sheetId: config.sheetId,
  serviceAccountEmail: config.serviceAccountEmail,
  serviceAccountPrivateKey: config.serviceAccountPrivateKey,
  tabs: config.sheets
});

/* --- Initialize brain provider once at startup --- */
const brainProvider = createBrainProvider(config);

app.use('/public', express.static(path.join(__dirname, '..', 'public')));

function requireDashboardToken(req, res, next) {
  const token = req.get('x-dashboard-token');
  if (!token || token !== config.dashboardAdminToken) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  return next();
}

function normalizeEnum(value) {
  return String(value || '').trim();
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/dashboard', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'OneLifeCare_AI_Agent_Dashboard_v18_fixed.html'));
});

app.get('/api/dashboard/bootstrap', requireDashboardToken, async (req, res) => {
  try {
    const pages = await sheetClient.listPages();
    const selectedPageId = req.query.pageId || pages[0]?.Page_ID || '';
    const selectedPageRaw = pages.find((p) => String(p.Page_ID) === String(selectedPageId)) || null;
    const selectedPage = selectedPageRaw
      ? {
          Page_ID: selectedPageRaw.Page_ID,
          Page_Name: selectedPageRaw.Page_Name,
          Page_Name_Short: selectedPageRaw.Page_Name_Short,
          Team_Name: selectedPageRaw.Team_Name,
          AI_Page: selectedPageRaw.AI_Page,
          Page_Status: selectedPageRaw.Page_Status,
          Assigned_Persona_ID: selectedPageRaw.Assigned_Persona_ID
        }
      : null;
    const botControl = selectedPageId ? await sheetClient.getBotControlByPageId(selectedPageId) : null;
    const chats = selectedPageId ? await sheetClient.listChatControlByPageId(selectedPageId) : [];
    const audit = await sheetClient.listRecentAudit(20);

    res.json({
      selectedPage,
      botControl,
      chats,
      audit,
      pages: pages.map((p) => ({
        Page_ID: p.Page_ID,
        Page_Name: p.Page_Name,
        Page_Name_Short: p.Page_Name_Short,
        Team_Name: p.Team_Name,
        AI_Page: p.AI_Page,
        Page_Status: p.Page_Status,
        Assigned_Persona_ID: p.Assigned_Persona_ID
      }))
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/dashboard/page-ai', requireDashboardToken, async (req, res) => {
  try {
    const { pageId, value } = req.body || {};
    const normalized = normalizeEnum(value).toUpperCase();
    if (!['ON', 'OFF'].includes(normalized)) {
      return res.status(400).json({ ok: false, error: 'value must be ON or OFF' });
    }
    const currentPage = await sheetClient.getPageById(pageId);
    const ok = await sheetClient.updatePageAiByPageId(pageId, normalized);
    await sheetClient.appendActionLog({
      entity: 'dashboard',
      action: 'dashboard_page_ai_toggle',
      threadId: '',
      oldValue: currentPage?.AI_Page || '',
      meta: { pageId, newValue: normalized },
      reason: 'dashboard action'
    });
    res.json({ ok });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/dashboard/bot-enabled', requireDashboardToken, async (req, res) => {
  try {
    const { pageId, value, reason = '' } = req.body || {};
    const normalized = normalizeEnum(value);
    if (!['Yes', 'No'].includes(normalized)) {
      return res.status(400).json({ ok: false, error: 'value must be Yes or No' });
    }
    const currentBot = await sheetClient.getBotControlByPageId(pageId);
    const ok = await sheetClient.updateBotEnabledByPageId(pageId, normalized, reason);
    await sheetClient.appendActionLog({
      entity: 'dashboard',
      action: 'dashboard_bot_enabled_toggle',
      threadId: '',
      oldValue: currentBot?.AI_Enabled || '',
      meta: { pageId, newValue: normalized, reason },
      reason: 'dashboard action'
    });
    res.json({ ok });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/dashboard/chat-ai', requireDashboardToken, async (req, res) => {
  try {
    const { pageId, threadId, value, reason = '' } = req.body || {};
    const normalized = normalizeEnum(value).toUpperCase();
    if (!['ON', 'OFF'].includes(normalized)) {
      return res.status(400).json({ ok: false, error: 'value must be ON or OFF' });
    }
    const currentChat = await sheetClient.getChatControlByThreadAndPage({ pageId, threadId });
    const ok = await sheetClient.updateChatAiByThreadAndPage({ pageId, threadId, value: normalized, reason });
    await sheetClient.appendActionLog({
      entity: 'dashboard',
      action: 'dashboard_chat_ai_toggle',
      threadId,
      oldValue: currentChat?.AI_Chat || '',
      meta: { pageId, threadId, newValue: normalized, reason },
      reason: 'dashboard action'
    });
    res.json({ ok });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get(config.webhookPath, (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.verifyToken) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

app.post(config.webhookPath, async (req, res) => {
  console.log('[webhook] POST received');
  const signature = req.get('X-Hub-Signature-256');

  if (!isValidSignature({ appSecret: config.appSecret, signatureHeader: signature, rawBody: req.rawBody || Buffer.from('') })) {
    console.warn('[webhook] signature_rejected');
    try {
      await sheetClient.appendActionLog({
        entity: 'webhook',
        action: 'signature_rejected',
        threadId: '',
        reason: 'X-Hub-Signature-256 mismatch'
      });
    } catch (auditError) {
      console.error('[webhook] failed to write signature_rejected audit:', auditError.message);
    }
    return res.sendStatus(403);
  }

  const messaging = req.body?.entry?.[0]?.messaging?.[0];
  const text = messaging?.message?.text;

  if (!messaging || typeof text !== 'string' || !text.trim()) {
    console.log('[webhook] payload_skipped (no message.text)');
    try {
      await sheetClient.appendActionLog({
        entity: 'webhook',
        action: 'payload_skipped',
        pageId: req.body?.entry?.[0]?.id || '',
        threadId: messaging?.sender?.id || '',
        reason: 'no message.text'
      });
    } catch (auditError) {
      console.error('[webhook] failed to write payload_skipped audit:', auditError.message);
    }
    return res.status(200).json({ ok: true, skipped: true });
  }

  const event = {
    pageId: req.body.entry[0].id,
    senderPsid: messaging.sender.id,
    text: text.trim(),
    timestamp: messaging.timestamp
  };

  res.status(200).json({ ok: true });

  setImmediate(async () => {
    try {
      await processIncomingText({ event, config, sheetClient, brainProvider });
    } catch (error) {
      console.error('Phase1 processing error:', error.message);
      try {
        await sheetClient.appendActionLog({
          entity: 'runtime',
          action: 'error',
          pageId: event.pageId,
          threadId: event.senderPsid,
          reason: error.message
        });
      } catch (auditError) {
        console.error('Phase1 audit write failed:', auditError.message);
      }
    }
  });

  return undefined;
});

app.listen(config.port, () => {
  console.log(`Phase1 runtime listening on :${config.port}${config.webhookPath}`);
});
