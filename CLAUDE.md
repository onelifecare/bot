# CLAUDE.md

## Project
This repository is the runtime for the One Life Care AI Messenger Bot.

The bot handles:
- Meta Messenger webhook intake
- Google Sheets-backed control/state
- dashboard controls
- AI brain decision flow
- human handoff flow

## Working rules
1. Always read `docs/PROJECT_STATE.md` before making any change.
2. Do not reopen or rewrite Phase 1 unless explicitly requested.
3. Keep scope minimal and isolated.
4. Never code directly on `main`.
5. Always work on a new branch and open a PR.
6. Before coding, reply with a short implementation plan in Arabic inside one plain text code block.
7. After coding, reply in Arabic inside one plain text code block with:
   - what changed
   - why
   - commit SHA
   - PR link
8. Do not broaden scope.
9. Do not change dashboard, sheets, webhook, or runtime flow unless the task explicitly requires it.
10. Preserve existing contracts unless explicitly requested.

## Current architecture constraints
- `src/brain.js` contract must remain stable.
- `decideWithBrain({ messageText, state, context, provider })` is the stable brain entrypoint.
- `MockBrainProvider` must remain as safe fallback unless explicitly removed later.
- Provider initialization should happen once at startup, not per message request.
- Human handoff flow must remain functional.

## Current strategic direction
- The current repo contains an OpenAI-compatible provider wiring.
- Strategic product direction has changed:
  - future provider work should target **Gemini**
  - do not continue OpenAI-specific expansion unless explicitly requested
- Treat provider migration as a separate scoped task.

## Important separation of concerns
There are 3 separate work tracks. Do not mix them unless explicitly requested:
1. LLM/provider work
2. Meta Messenger app setup and operational alignment
3. Docs/specs / project organization

## Meta Messenger setup (resolved path)
The earlier "admin/test-only, public access blocked" behavior is no longer the active project state.

The working operational path that fixed it was **not** the old app-review / business-verification track. It was:
1. create a new Meta app
2. publish the new Meta app
3. configure the Messenger webhook on the new app
4. keep the webhook callback URL aligned with the running app
5. keep `FB_VERIFY_TOKEN` aligned between the deployment env and the Meta webhook setup
6. update `FB_APP_SECRET` in the deployment env to the new app's secret
7. generate a new Page access token from the new app
8. update `Pages.Page_Access_Token` in the Google Sheet

After this, the bot responded correctly beyond the earlier admin/test-only limitation in the current setup.

Do not treat app review / business verification as the active operational path for this issue. If the bot regresses on public replies, the first check is the operational alignment below, not reopening the old review track.

### Operational alignment (must stay in sync)
These four values must remain aligned or the Messenger flow will break:
- webhook callback URL (deployment ↔ Meta app webhook config)
- `FB_VERIFY_TOKEN` (deployment env ↔ Meta webhook setup)
- `FB_APP_SECRET` (deployment env ↔ new Meta app secret)
- `Pages.Page_Access_Token` (Google Sheet ↔ token generated from the new app)

## Safety and review discipline
- Do not invent facts.
- If something is not confirmed from code or explicit project state, say so.
- If a PR is not merge-ready, say exactly why.
- Prefer small PRs.
