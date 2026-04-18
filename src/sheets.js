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

  async listOffersForPage(pageId) {
        const tabName = this.tabs.offers || 'Offers';
        const rows = await this.readTab(tabName);
        const target = String(pageId);
        return rows.filter((r) => {
              if (String(r.Active || '').trim().toLowerCase() !== 'yes') return false;
              const rowPageId = String(r.Page_ID || '').trim();
              return rowPageId === '' || rowPageId === target;
        });
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

      /* --- Phase 2: handoff row append (fixed 13-column mapping) --- */
        async appendHandoff({ pageId, threadId, reason, reasonNote = '', customerName = '', phone1 = '' }) {
                    const tabName = this.tabs.handoffs || 'Handoffs';
                    const handoffId = `HO-${Date.now()}`;
                    const now = new Date().toISOString();
                    const values = [[
                                    handoffId,          // A  Handoff_ID
                                    now,                // B  Created_At
                                    pageId,             // C  Page_ID
                                    threadId,           // D  Thread_ID
                                    customerName,       // E  Customer_Name
                                    phone1,             // F  Phone_1
                                    reason,             // G  Reason_Type
                                    reasonNote,         // H  Reason_Note
                                    'Waiting_Human',    // I  Chat_Status
                                    '',                 // J  Assigned_To
                                    'No',               // K  Handled
                                    '',                 // L  Resolved_At
                                    ''                  // M  Resolution_Note
                                ]];

                    await this.sheets.spreadsheets.values.append({
                                    spreadsheetId: this.sheetId,
                                    range: `${tabName}!A:M`,
                                    valueInputOption: 'USER_ENTERED',
                                    insertDataOption: 'INSERT_ROWS',
                                    requestBody: { values }
                    });
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
