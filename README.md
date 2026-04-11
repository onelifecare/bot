# One Life Care AI Agent

Minimal **Phase 1** runtime plumbing only.

Verified from the attached XLSX workbook: log tab is `Audit` (not `Action_Log`).

## What this implementation does
- Receives incoming Messenger webhook text messages.
- Reads from Google Sheet tabs: `Pages`, `BotControl`, `ChatControl`.
- Stops + logs when page is inactive/missing or AI is disabled.
- Creates initial `ChatControl` state for new chats.
- Sends one static greeting in Egyptian Arabic.
- Writes back to `ChatControl` and log tab.

## Scope guard (not implemented)
- No HealthGate logic.
- No Offers logic.
- No Variants logic.
- No Orders flow.
- No dashboard UI changes.

## Local run
1) Install
```bash
npm install
```

2) Env setup
```bash
cp .env.example .env
```
Then fill `.env` with real Facebook + Google Sheets credentials.

3) Run
```bash
npm run start
```

4) Simple webhook test (local)
```bash
curl -i -X POST "http://localhost:3000/webhook/messenger" \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=invalid_for_quick_test" \
  -d '{"entry":[{"id":"PAGE_ID","messaging":[{"sender":{"id":"PSID"},"timestamp":1710000000000,"message":{"text":"السلام عليكم"}}]}]}'
```
Expected for this quick test: `403` (because signature is intentionally invalid). With a valid signature from Facebook, it should return `200`.
