import crypto from 'crypto';
import axios from 'axios';

export function isValidSignature({ appSecret, signatureHeader, rawBody }) {
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const expected = signatureHeader;
  const digest = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const computed = `sha256=${digest}`;

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(computed));
}

export async function sendTextMessage({ pageAccessToken, recipientPsid, text }) {
  await axios.post(
    'https://graph.facebook.com/v20.0/me/messages',
    {
      recipient: { id: recipientPsid },
      messaging_type: 'RESPONSE',
      message: { text }
    },
    {
      params: { access_token: pageAccessToken },
      timeout: 10_000
    }
  );
}
