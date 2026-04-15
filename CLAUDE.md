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
2. Meta Messenger app/public-access issue
3. Docs/specs / project organization

## Meta Messenger production issue
Known current issue:
- the bot responds to admin/test accounts
- the bot does not yet respond to general public accounts
Do not assume this is caused by webhook hosting alone.
Treat Meta app mode / permissions / review / business verification as a separate investigation track.

## Safety and review discipline
- Do not invent facts.
- If something is not confirmed from code or explicit project state, say so.
- If a PR is not merge-ready, say exactly why.
- Prefer small PRs.
