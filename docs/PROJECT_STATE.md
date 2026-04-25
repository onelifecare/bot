# PROJECT_STATE.md

## Repository
One Life Care AI Messenger Bot runtime

## Current status
The project has completed the early runtime foundation and the initial AI-brain wiring stage.

### Confirmed completed
- Messenger webhook endpoint is working
- Google Sheets integration is working
- Dashboard is live and connected
- ChatControl write/update flow is working
- Audit logging is working
- Handoff row creation is working
- `src/brain.js` abstraction exists and is stable
- provider is initialized once at startup and passed into runtime
- fallback to `MockBrainProvider` exists
- real LLM provider wiring PR has already been merged

## Important current code state
The repository currently includes:
- `src/brain.js`
- `src/runtime.js`
- `src/server.js`
- `src/sheets.js`
- `src/llm-provider.js`

The current provider wiring is OpenAI-compatible in code.
However, this is **not** the final product direction.

## Strategic direction from now
The intended next AI provider direction is:
- **Gemini**, not OpenAI

This means:
- do not continue building OpenAI-specific assumptions unless explicitly requested
- future provider work should be scoped as Gemini migration / Gemini provider support

## Resolved: Meta setup path
The earlier "admin/test-only, public access blocked" behavior is no longer the active project state.

The working operational path that fixed it was **not** the old app-review / business-verification track. The confirmed working path was:
1. create a new Meta app
2. publish the new Meta app
3. configure the Messenger webhook on the new app
4. keep the webhook callback URL aligned with the running app
5. keep `FB_VERIFY_TOKEN` aligned between the deployment env and the Meta webhook setup
6. update `FB_APP_SECRET` in the deployment env to the new app's secret
7. generate a new Page access token from the new app
8. update `Pages.Page_Access_Token` in the Google Sheet

After this, the bot responded correctly beyond the earlier admin/test-only limitation in the current setup. The old review-driven investigation path is not the current active operational path.

## Operational alignment (must stay in sync)
These four values must remain aligned or the Messenger flow will break:
- webhook callback URL (deployment ↔ Meta app webhook config)
- `FB_VERIFY_TOKEN` (deployment env ↔ Meta webhook setup)
- `FB_APP_SECRET` (deployment env ↔ new Meta app secret)
- `Pages.Page_Access_Token` (Google Sheet ↔ token generated from the new app)

## Operating Doctrine (canonical)
Full version: `runtime_spec_v1.md § 1.A`. Governs all runtime work going forward.

- **Source of truth**: the dashboard + Google Sheet tabs own all customer-facing content — offer names, prices, components, messages, variants, media, shipping, health rules. Runtime reads them every turn; runtime never authors them.
- **Persona is runtime-relevant**, not decoration. `Personas` controls identity, tone, intro, escalation. Resolved on every turn from `Pages.Assigned_Persona_ID`.
- **AI is a selector + persuader**, not an author. Allowed: intent classification, field extraction, picking the best valid offer/variant from loaded rows, grounded persuasion, grounded comparisons, grounded math (e.g. per-course price) **only** from real sheet values.
- **AI must never invent**: offer names, prices, package contents, product claims, shipping values, persona identity.
- **Free-form LLM replies are minimised**. Critical sales content (6-step offer sequence, objection variants, health-gate replies, booking prompts, delivery/post-send) comes from the sheet verbatim (after placeholder substitution). The AI only composes short bridges and clarifying questions.
- **Locked selling flow is unchanged**: Opening → Diagnosis → Recommendation → (Objection ↔ Recommendation)\* → Booking → PostSend → Closed, with Brief → Image → Why → [Components if asked] → Proof → Close preserved.
- **Target**: Persona-driven + Dashboard-controlled + AI-assisted selling. Not: freestyle LLM selling.

Status of implementation vs doctrine (live as of PR #23 merged):
- ✅ Real Offers catalog is injected into `business_context` every turn (`src/runtime.js`).
- ✅ System prompt forbids invention outside loaded context (`src/llm-provider.js`).
- ✅ Stage transition table enforced at runtime (`src/runtime.js`, Patch P1 merged).
- ✅ Audit meta carries `recommended_offer` + `offers_count` for verifiability.
- ⏳ Persona wiring into `business_context` — not yet active. The doctrine mandates it; scope it as a future persona-wiring patch, parallel to the P3 locked-sequence dispatch.
- ⏳ Dashboard-sourced messages for the 6-step offer sequence / objection variants / health-gate replies — not yet active (P3+). Until then, free-form LLM replies cover these, which the doctrine explicitly marks as temporary.

## Work tracks from this point
### Track A — Meta setup (resolved, monitor-only)
The earlier admin/test-only limitation is resolved via the new Meta app path above.
Ongoing work on this track is monitor-only: confirm the four operational alignment values stay in sync. Do not reopen the old app-review investigation unless there is concrete evidence of a new regression.

### Track B — Provider direction
Migrate or extend provider support toward Gemini in a clean, minimal way.

### Track C — Specs and project structure
Add and maintain project specs so future agents do not lose context.

## Non-goals unless explicitly requested
- rewriting Phase 1
- redesigning dashboard from scratch
- rewriting Sheets integration
- large refactors without approval
- mixing provider migration with Meta setup/alignment changes in one PR

## Working style
- one scoped task at a time
- one branch per task
- one PR per task
- Arabic summaries
- minimal changes
- explicit evidence when claiming something is broken or fixed
