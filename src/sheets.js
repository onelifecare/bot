import { google } from 'googleapis';

function toObjects(rows) {
  if (!rows || rows.length < 2) return [];
  const [header, ...dataRows] = rows;
  return dataRows
    .filter((row) => row.some((value) => String(value || '').trim() !== ''))
    .map((row) => {
      const obj = {};
      for (let i = 0; i < header.length; i += 1) {
        obj[String(header[i]).trim()] = row[i] ?? '';
      }
      return obj;
    });
}

export class SheetClient {
  constructor({ sheetId, serviceAccountEmail, serviceAccountPrivateKey, tabs }) {
    this.sheetId = sheetId;
    this.tabs = tabs;

    const auth = new google.auth.JWT({
      email: serviceAccountEmail,
      key: serviceAccountPrivateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    this.sheets = google.sheets({ version: 'v4', auth });
  }

  async readTab(tabName) {
    const range = `${tabName}!A:ZZ`;
    const res = await this.sheets.spreadsheets.values.get({ spreadsheetId: this.sheetId, range });
    return toObjects(res.data.values || []);
  }

  async readTabRaw(tabName) {
    const range = `${tabName}!A:ZZ`;
    const res = await this.sheets.spreadsheets.values.get({ spreadsheetId: this.sheetId, range });
    const values = res.data.values || [];
    const header = values[0] || [];
    const rows = values.slice(1);
    return { header, rows };
  }

  async getPageById(pageId) {
    const rows = await this.readTab(this.tabs.pages);
    return rows.find((r) => String(r.Page_ID) === String(pageId)) || null;
  }

  async getBotControlByPageId(pageId) {
    const rows = await this.readTab(this.tabs.botControl);
    return rows.find((r) => String(r.Page_ID) === String(pageId)) || null;
  }

  async getChatControlByThreadAndPage({ threadId, pageId }) {
    const rows = await this.readTab(this.tabs.chatControl);
    return rows.find((r) => String(r.Thread_ID) === String(threadId) && String(r.Page_ID) === String(pageId)) || null;
  }

  async upsertChatControl({ row }) {
    const rows = await this.readTab(this.tabs.chatControl);
    const headers = rows.length ? Object.keys(rows[0]) : [];

    const requiredHeaders = [
      'Thread_ID',
      'Page_ID',
      'AI_Chat',
      'Chat_Stage',
      'Last_Action',
      'Collected_Fields_JSON',
      'Is_Archived',
      'Last_Updated_At'
    ];

    const finalHeaders = headers.length ? headers : requiredHeaders;

    const targetIndex = rows.findIndex(
      (r) => String(r.Thread_ID) === String(row.Thread_ID) && String(r.Page_ID) === String(row.Page_ID)
    );

    const rowValues = finalHeaders.map((header) => row[header] ?? '');

    if (targetIndex >= 0) {
      const sheetRowNumber = targetIndex + 2;
      const endCol = columnLabel(finalHeaders.length);
      const range = `${this.tabs.chatControl}!A${sheetRowNumber}:${endCol}${sheetRowNumber}`;
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.sheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [rowValues] }
      });
      return;
    }

    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.sheetId,
      range: `${this.tabs.chatControl}!A:ZZ`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [rowValues] }
    });
  }

  async appendActionLog(logRow) {
    const values = [[
      '',
      new Date().toISOString(),
      logRow.entity || 'runtime',
      logRow.threadId || '',
      logRow.action || '',
      'runtime',
      logRow.oldValue || '',
      JSON.stringify(logRow.meta || {}),
      logRow.reason || ''
    ]];

    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.sheetId,
      range: `${this.tabs.actionLog}!A:I`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values }
    });
  }

  async listPages() {
    return this.readTab(this.tabs.pages);
  }

  async listChatControlByPageId(pageId) {
    const rows = await this.readTab(this.tabs.chatControl);
    return rows.filter((r) => String(r.Page_ID) === String(pageId));
  }

  async listRecentAudit(limit = 20) {
    const rows = await this.readTab(this.tabs.actionLog);
    return rows.slice(-Math.max(1, Number(limit))).reverse();
  }

  async updateRowInTab({ tabName, match, updates }) {
    const { header, rows } = await this.readTabRaw(tabName);
    if (!header.length) return false;

    const rowIndex = rows.findIndex((row) => {
      const obj = {};
      for (let i = 0; i < header.length; i += 1) obj[String(header[i]).trim()] = row[i] ?? '';
      return match(obj);
    });

    if (rowIndex < 0) return false;

    const current = rows[rowIndex];
    const merged = header.map((h, idx) => {
      const key = String(h).trim();
      return Object.prototype.hasOwnProperty.call(updates, key) ? updates[key] : (current[idx] ?? '');
    });

    const sheetRowNumber = rowIndex + 2;
    const endCol = columnLabel(header.length);
    const range = `${tabName}!A${sheetRowNumber}:${endCol}${sheetRowNumber}`;

    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.sheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [merged] }
    });

    return true;
  }

  async updatePageAiByPageId(pageId, value) {
    return this.updateRowInTab({
      tabName: this.tabs.pages,
      match: (r) => String(r.Page_ID) === String(pageId),
      updates: { AI_Page: value }
    });
  }

  async updateBotEnabledByPageId(pageId, value, reason = '') {
    return this.updateRowInTab({
      tabName: this.tabs.botControl,
      match: (r) => String(r.Page_ID) === String(pageId),
      updates: { AI_Enabled: value, Reason: reason, Updated_At: new Date().toISOString() }
    });
  }

  async updateChatAiByThreadAndPage({ pageId, threadId, value, reason = '' }) {
    return this.updateRowInTab({
      tabName: this.tabs.chatControl,
      match: (r) => String(r.Page_ID) === String(pageId) && String(r.Thread_ID) === String(threadId),
      updates: { AI_Chat: value, AI_Chat_OFF_Reason: reason }
    });
  }

  async updateChatControlByThreadAndPage({ pageId, threadId, updates }) {
    return this.updateRowInTab({
      tabName: this.tabs.chatControl,
      match: (r) => String(r.Page_ID) === String(pageId) && String(r.Thread_ID) === String(threadId),
      updates
    });
  }

  async createHandoff({ pageId, threadId, reasonType, reasonNote = '', customerName = '', phone1 = '' }) {
    const handoffId = `HAND-${Date.now()}`;
    const values = [[
      handoffId,
      new Date().toISOString(),
      pageId || '',
      threadId || '',
      customerName || '',
      phone1 || '',
      reasonType || 'Runtime_Failure',
      reasonNote || '',
      'Waiting_Human',
      '',
      'No',
      '',
      ''
    ]];

    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.sheetId,
      range: 'Handoffs!A:M',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values }
    });

    return handoffId;
  }

  async loadAiContext({ pageId, threadId }) {
    const [
      pages,
      personas,
      botControl,
      chatControl,
      offers,
      products,
      offerItems,
      blocks,
      messages,
      variants,
      healthGate,
      shippingRules,
      ordersDraft,
      handoffs,
      aiCorrections,
      training
    ] = await Promise.all([
      this.readTab(this.tabs.pages),
      this.readTab('Personas'),
      this.readTab(this.tabs.botControl),
      this.readTab(this.tabs.chatControl),
      this.readTab('Offers'),
      this.readTab('Products'),
      this.readTab('Offer_Items'),
      this.readTab('Blocks'),
      this.readTab('Messages'),
      this.readTab('Variants'),
      this.readTab('HealthGate'),
      this.readTab('ShippingRules'),
      this.readTab('OrdersDraft'),
      this.readTab('Handoffs'),
      this.readTab('AiCorrections'),
      this.readTab('Training')
    ]);

    return {
      pages: pages.filter((r) => String(r.Page_ID) === String(pageId)),
      personas,
      botControl: botControl.filter((r) => String(r.Page_ID) === String(pageId)),
      chatControl: chatControl.filter((r) => String(r.Page_ID) === String(pageId) && String(r.Thread_ID) === String(threadId)),
      offers,
      products,
      offerItems,
      blocks,
      messages,
      variants,
      healthGate,
      shippingRules,
      ordersDraft: ordersDraft.filter((r) => String(r.Page_ID) === String(pageId)),
      handoffs: handoffs.filter((r) => String(r.Page_ID) === String(pageId)),
      aiCorrections,
      training
    };
  }
}

function columnLabel(index1Based) {
  let dividend = index1Based;
  let col = '';
  while (dividend > 0) {
    const modulo = (dividend - 1) % 26;
    col = String.fromCharCode(65 + modulo) + col;
    dividend = Math.floor((dividend - modulo) / 26);
  }
  return col;
}
