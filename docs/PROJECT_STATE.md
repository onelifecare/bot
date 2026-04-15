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

## Known current business/technical issue
### Meta public access problem
Current observed issue:
- the bot responds to admin/test accounts
- the bot does not respond to normal public accounts

This is currently an open issue.
It should be treated as a Meta platform / app configuration / permissions / review / mode investigation track.
Do not assume DigitalOcean hosting is the root cause without evidence.

## Work tracks from this point
### Track A — Meta public access
Investigate why the app responds only to admin/test users.

### Track B — Provider direction
Migrate or extend provider support toward Gemini in a clean, minimal way.

### Track C — Specs and project structure
Add and maintain project specs so future agents do not lose context.

## Non-goals unless explicitly requested
- rewriting Phase 1
- redesigning dashboard from scratch
- rewriting Sheets integration
- large refactors without approval
- mixing provider migration with Meta public-access debugging in one PR

## Working style
- one scoped task at a time
- one branch per task
- one PR per task
- Arabic summaries
- minimal changes
- explicit evidence when claiming something is broken or fixed
