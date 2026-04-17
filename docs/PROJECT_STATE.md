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
