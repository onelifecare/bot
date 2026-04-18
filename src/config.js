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
  dashboardAdminToken: required('DASHBOARD_ADMIN_TOKEN'),
  sheetId: required('GOOGLE_SHEET_ID'),
  serviceAccountEmail: required('GOOGLE_SERVICE_ACCOUNT_EMAIL'),
  serviceAccountPrivateKey: required('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY').replace(/\\n/g, '\n'),
  sheets: {
    pages: process.env.SHEET_PAGES_TAB || 'Pages',
    botControl: process.env.SHEET_BOTCONTROL_TAB || 'BotControl',
    chatControl: process.env.SHEET_CHATCONTROL_TAB || 'ChatControl',
    actionLog: process.env.SHEET_ACTION_LOG_TAB || 'Audit',
    handoffs: process.env.SHEET_HANDOFFS_TAB || 'Handoffs',
    offers: process.env.SHEET_OFFERS_TAB || 'Offers',
    personas: process.env.SHEET_PERSONAS_TAB || 'Personas'
  },
  greetingText: process.env.STATIC_GREETING_AR || 'أهلاً بيك 👋 أنا معاك من فريق One Life Care، تحت أمرك.',

    /* --- AI / LLM provider ---
     * Strategic direction: Gemini. OpenAI-related vars are retained as a legacy
     * compatibility layer and should not be relied on for new setups.
     */
    brainProvider: (process.env.BRAIN_PROVIDER || 'mock').toLowerCase().trim(),
    aiSystemPrompt: process.env.AI_SYSTEM_PROMPT || '',

    /* Gemini (intended provider path) */
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash',

    /* OpenAI (legacy compatibility layer) */
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    aiModel: process.env.AI_MODEL || 'gpt-4o-mini',
    aiApiUrl: process.env.AI_API_URL || '',
};
