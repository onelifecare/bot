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
