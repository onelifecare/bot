# One Life Care AI Agent — Runtime

Node.js/Express runtime for the One Life Care Messenger bot. Webhook intake, Google-Sheets-backed state, dashboard-controlled content, persona-driven rendering, and an AI brain that selects and persuades on top of sheet-sourced data.

## Canonical docs

Read these before making changes:

- [`runtime_spec_v1.md`](runtime_spec_v1.md) — runtime spec. **§ 1.A is the Operating Doctrine** and is binding on every change.
- [`field_mapping.md`](field_mapping.md) — Google Sheet fields read/written by the runtime.
- [`dashboard_sheet_mapping.md`](dashboard_sheet_mapping.md) — dashboard ↔ sheet mapping.
- [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md) — current project state and active work tracks.
- [`CLAUDE.md`](CLAUDE.md) — working rules for Claude Code sessions.
- [`docs/archive/`](docs/archive/) — historical docs, **not** authoritative.

## Architecture in one line
Persona-driven + Dashboard-controlled + AI-assisted selling. Never freestyle LLM selling. See `runtime_spec_v1.md § 1.A` for the full doctrine.

## What is live

- Messenger webhook endpoint + signature validation (`src/server.js`).
- Google Sheets read/write for `Pages`, `BotControl`, `ChatControl`, `Offers`, `Handoffs`, `Audit` (`src/sheets.js`).
- AI brain abstraction with `MockBrainProvider` fallback (`src/brain.js`).
- Gemini provider with multi-strategy JSON repair + partial-extract fallback (`src/llm-provider.js`). OpenAI legacy path kept as compatibility layer.
- Stage transition guard enforcing the Opening → Diagnosis → Recommendation → Objection → Booking → PostSend → Closed graph (`src/runtime.js`).
- Offers catalog injected into the brain's business context every turn, with `recommended_offer` audited.

## What is NOT yet live

- Persona wiring (resolving `Pages.Assigned_Persona_ID` → `Personas` and threading it through every reply).
- The locked 6-step offer dispatch (Brief → Image → Why → [Components] → Proof → Close) sourced from `Offers.Offer_Bot_Brief` / `Offer_Why_Message` / `Offer_Close_Question` + `MediaAssets`.
- Objection variant rotation from `Variants` + `ObjectionMediaLinks`.
- Health gate.
- Booking-stage `OrdersDraft` upsert + `ShippingRules` lookup.

These are tracked as P3+ and must, when built, follow the Operating Doctrine in `runtime_spec_v1.md § 1.A` — all critical sales content sourced from sheet rows, with the AI choosing which row and composing only short bridges.

## Local run

```bash
npm install
cp .env.example .env
# fill .env with real Facebook + Google Sheets credentials
npm run start
```

### Minimal smoke test

```bash
curl -i -X POST "http://localhost:3000/webhook/messenger" \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=invalid_for_quick_test" \
  -d '{"entry":[{"id":"PAGE_ID","messaging":[{"sender":{"id":"PSID"},"timestamp":1710000000000,"message":{"text":"السلام عليكم"}}]}]}'
```

Expected `403` because the signature is intentionally invalid. With a valid Facebook-signed payload the endpoint returns `200`.

## Operational alignment

The Messenger flow breaks if any of these four drift apart — monitor them, do not reopen the old app-review track:

- webhook callback URL (deployment ↔ Meta app webhook config)
- `FB_VERIFY_TOKEN` (env ↔ Meta webhook setup)
- `FB_APP_SECRET` (env ↔ Meta app secret)
- `Pages.Page_Access_Token` (Google Sheet ↔ token from the live Meta app)
