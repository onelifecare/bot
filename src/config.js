import dotenv from 'dotenv';

dotenv.config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT || 3000),
  webhookPath: process.env.WEBHOOK_PATH || '/webhook/messenger',
  verifyToken: required('FB_VERIFY_TOKEN'),
  appSecret: required('FB_APP_SECRET'),
  sheetId: required('GOOGLE_SHEET_ID'),
  serviceAccountEmail: required('GOOGLE_SERVICE_ACCOUNT_EMAIL'),
  serviceAccountPrivateKey: required('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY').replace(/\\n/g, '\n'),
  sheets: {
    pages: process.env.SHEET_PAGES_TAB || 'Pages',
    botControl: process.env.SHEET_BOTCONTROL_TAB || 'BotControl',
    chatControl: process.env.SHEET_CHATCONTROL_TAB || 'ChatControl',
    actionLog: process.env.SHEET_ACTION_LOG_TAB || 'Audit'
  },
  greetingText: process.env.STATIC_GREETING_AR || 'أهلاً بيك 👋 أنا معاك من فريق One Life Care، تحت أمرك.'
};
