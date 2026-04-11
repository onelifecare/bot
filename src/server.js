import express from 'express';
import { config } from './config.js';
import { isValidSignature } from './messenger.js';
import { SheetClient } from './sheets.js';
import { processIncomingText } from './runtime.js';

const app = express();

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
  const signature = req.get('X-Hub-Signature-256');

  if (!isValidSignature({ appSecret: config.appSecret, signatureHeader: signature, rawBody: req.rawBody || Buffer.from('') })) {
    return res.sendStatus(403);
  }

  const messaging = req.body?.entry?.[0]?.messaging?.[0];
  const text = messaging?.message?.text;

  if (!messaging || typeof text !== 'string' || !text.trim()) {
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
      await processIncomingText({ event, config, sheetClient });
    } catch (error) {
      console.error('Phase1 processing error:', error.message);
      await sheetClient.appendActionLog({
        entity: 'runtime',
        action: 'error',
        pageId: event.pageId,
        threadId: event.senderPsid,
        reason: error.message
      });
    }
  });

  return undefined;
});

app.listen(config.port, () => {
  console.log(`Phase1 runtime listening on :${config.port}${config.webhookPath}`);
});
