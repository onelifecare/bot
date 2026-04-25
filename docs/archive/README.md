# Archive

Historical documents kept for reference. **Not authoritative.** Do not treat any file in this folder as current product truth or current implementation target.

Canonical, live documents live at the repo root:
- `runtime_spec_v1.md` — runtime spec (includes Operating Doctrine at § 1.A)
- `field_mapping.md` — sheet field mapping
- `dashboard_sheet_mapping.md` — dashboard ↔ sheet mapping
- `CLAUDE.md` — instructions for Claude Code sessions
- `docs/PROJECT_STATE.md` — current project state and work tracks

## Contents

### `AGENTS_v1_phase1.md` (formerly `/AGENTS.md`)
The original Phase-1 scope document. Describes the initial "receive webhook → send a static greeting → write ChatControl" milestone. That milestone has been completed and the runtime has moved far past it (Gemini brain, stage-transition guard, Offers wiring). The product rules originally captured here (Offers as the primary selling layer; `Customer_Offer_Name` for customer-facing text; never rename `Offer_Why_Message`; Egyptian Arabic tone) are now carried in `runtime_spec_v1.md § 1` and § 1.A in newer wording. Archived to avoid confusing new agents about what "Phase 1 scope" means today.

### `n8n_flow_v1_plan.md` (formerly `/n8n_flow_v1_plan.md`)
A detailed node-by-node plan for building the runtime inside n8n. The current runtime is a Node.js/Express service in `src/` (not n8n), so this plan is not a live build target. Retained because it is still a useful design reference for intent classification, branch-per-intent shape, placeholder substitution, and retry/failure patterns — all of which stay applicable when the P3 locked-sequence dispatch is built in our actual stack. If you are designing P3, read it as inspiration, not as instructions.
