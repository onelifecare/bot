# Dashboard ↔ Sheet Mapping

Source files:
- `OneLifeCare_AI_Agent_Dashboard_v18_fixed.html`
- `OneLifeCare_Master_Sheet_v24_runtime_ready.xlsx`

Legend:
- **R** = read
- **W** = write
- **Local-only** = lives in dashboard state (JS), not yet synced to sheet
- **Sheet-driven after runtime v1** = item that the runtime reads/writes directly; dashboard must eventually read from the same source of truth

---

## 1. Home / Dashboard
- **R**: `OrdersDraft`, `Handoffs`, `ChatControl`, `Pages`, `Personas`
- **W**: none (display only)
- **Local-only**: stat counters (derived client-side), persona preview bar
- **Notes**: shows alerts, quick orders, quick handoffs. After runtime v1, refresh cadence should be 30s so operators see new handoffs quickly.

## 2. Orders Screen
- **R**: `OrdersDraft`, `OrdersMaster`, `ShippingRules`
- **W**: `OrdersDraft` (status/notes edits), `OrdersMaster` (on confirmation), `Audit`
- **Local-only**: search/filter state, selected draft
- **Sheet-driven after runtime v1**: `OrdersDraft.Order_Status` transitions. Runtime sets `Ready`, dashboard operator moves it to `OrdersMaster`.

## 3. Handoffs Screen
- **R**: `Handoffs`, `ChatControl`
- **W**: `Handoffs` (resolution fields), `ChatControl` (flip `AI_Chat` back to ON), `Audit`
- **Local-only**: active filter, selected handoff
- **Notes**: this screen becomes critical once runtime is live — every runtime handoff shows here.

## 4. Messages Screen
- **R**: `Messages`, `Blocks`, `AssetLinks`, `MediaAssets`
- **W**: `Messages`, `Blocks`, `AssetLinks`, `MediaAssets` (via Quick Attach), `Audit`
- **Local-only**: message preview, attach-sheet modal state
- **Notes**: runtime reads `Messages` by `Scenario_Key` (e.g., `HEALTH_BLOCKED`, `COMPONENTS_EXPLAINER`). Dashboard edits here directly affect runtime replies — no rebuild needed.

## 5. Offers Screen ⭐
- **R**: `Offers`, `MediaAssets`, `Offer_Items`, `Products`
- **W**: `Offers`, `MediaAssets` (when uploading offer image), `Audit`
- **Local-only**: filter tabs (`all`/`Single`/`Package`/`Special`/`inactive`), search
- **Sheet-driven after runtime v1**: the offer sending sequence is pulled directly from `Offers` columns (`Offer_Bot_Brief`, `Offer_Why_Message`, `Offer_Close_Question`, `Main_Image_Media_ID`, `Proof_Group_ID`). Editing on the dashboard immediately changes what the runtime sends.
- **Notes**: `Customer_Offer_Name` must always be used for customer-facing rendering. Dashboard already shows this with a "👁️ يظهر للعميل" label.

## 6. Files / Media Library
- **R**: `MediaAssets`, `AssetLinks`, `ObjectionMediaLinks`
- **W**: `MediaAssets`, `Audit`
- **Local-only**: filter tabs, preview modal
- **Notes**: placeholder URLs (`PUT_URL_HERE`) cause the runtime to skip the media item silently. Before pilot, fill real URLs for at least the LICENSE_TRUST / COMPETITOR_Q / GUARANTEE_Q seeds.

## 7. Variants / Objections Screen ⭐
- **R**: `Variants`, `ObjectionMediaLinks`, `MediaAssets`, `ENUMS` (stages + trigger keywords)
- **W**: `Variants`, `ObjectionMediaLinks`, `MediaAssets` (when uploading objection media), `Audit`
- **Local-only**: search, filter tabs, live preview of placeholder substitution (demo values)
- **Sheet-driven after runtime v1**: the runtime picks variants by `Scenario_Key` and rotates them. The `When_To_Use` column is internal only — not sent to customers. The objection trigger keywords live in `ENUMS.Variants.Trigger_Keywords`.
- **Notes**: the dashboard's placeholder demo values are cosmetic; the runtime substitutes from real chat state.

## 8. Settings → Bot Control (NEW, sheet-driven)
- **R**: `BotControl`
- **W**: `BotControl`, `Audit`
- **Local-only**: the existing "AI on/off" toggle in the header is currently pure UI state
- **Action required**: wire the header toggle to upsert a `BotControl` row for the current page. This is the only cross-cutting write the dashboard still owes runtime v1.

## 9. Settings → Pages Manager
- **R**: `Pages`, `Personas`
- **W**: `Pages`, `Audit`
- **Local-only**: the add/edit page sheet form

## 10. Settings → Personas Manager
- **R**: `Personas`, `Pages`
- **W**: `Personas`, `Audit`
- **Local-only**: nothing significant
- **Notes**: runtime reads the persona linked to the active page at every turn. Editing persona text here changes bot intro/escalation messages immediately.

## 11. Settings → Shipping Rules
- **R**: `ShippingRules`
- **W**: `ShippingRules`, `Audit`
- **Local-only**: filter by governorate
- **Notes**: runtime reads this to compute `OrdersDraft.Shipping_Price` when customer gives a governorate.

## 12. Settings → Health Gate
- **R**: `HealthGate`
- **W**: `HealthGate`, `Audit`
- **Local-only**: filter/search
- **Notes**: runtime uses `Condition_Aliases` as the primary matching field. Every alias must be pipe-separated (`|`).

## 13. Users & Access
- **R**: `Users`
- **W**: `Users`, `Audit`
- **Local-only**: login session
- **Notes**: not read by runtime at all. Runtime doesn't care about dashboard users.

## 14. Training Library
- **R**: `Training`
- **W**: `Training`, `Variants` (when converting a training insight to a new variant), `Audit`
- **Local-only**: upload state
- **Notes**: not read by runtime v1. Runtime v2 may use `AiCorrections` instead.

## 15. Audit / History
- **R**: `Audit`
- **W**: none
- **Notes**: runtime writes heavily to this tab. Dashboard is the primary consumer.

## 16. Chat Control Panel (inside Settings, admin-only)
- **R**: `ChatControl`
- **W**: `ChatControl` (force AI ON/OFF per thread), `Audit`
- **Local-only**: nothing
- **Notes**: runtime checks `ChatControl.AI_Chat` on every message. Flipping this in the dashboard instantly stops/resumes the bot for a single chat.

---

## Parts that remain LOCAL-ONLY (JS state) after runtime v1

These are fine as local state and should **not** be moved to the sheet in v1:

1. Filter tab selections, search inputs, pagination cursors (pure UI state)
2. Placeholder demo values (used only for preview in the editor)
3. Login session (`Session.currentUser`, `Session.currentPageId`)
4. Sheet modal open/close state
5. Page selector preview bar
6. All toast messages

---

## Parts that MUST become sheet-driven before pilot

1. **Header AI on/off toggle → `BotControl`** (see row 8 above). Currently the UI shows a toggle but doesn't persist.
2. **Chat Control per-thread toggle → `ChatControl.AI_Chat`** (already has the column, just wire the dashboard button).
3. **Message/Variant edits → already sheet-driven through the dashboard** (no work needed, but verify Google Sheets API writes are actually hitting the sheet, not just local memory).
4. **`OrdersDraft.Order_Status = Ready` → operator workflow**: the handoff screen should show these prominently so the operator knows runtime prepared an order for them.

---

## Quick reference: which tabs are read by runtime at every message turn?

**Always read (cached 10 min)**:
- `Pages`, `BotControl`, `Personas`
- `HealthGate`, `ShippingRules`
- `Offers`, `Messages`, `Variants`, `ObjectionMediaLinks`, `MediaAssets`
- `ENUMS` (for trigger keywords)

**Always read (never cached)**:
- `ChatControl`

**Read conditionally**:
- `Products` (only on direct product inquiry)
- `Offer_Items` (only if building a detailed offer breakdown)

**Always written (every turn)**:
- `ChatControl`, `Audit`

**Written conditionally**:
- `OrdersDraft` (Booking stage)
- `Handoffs` (trigger conditions)
- `MediaAssets` (never by runtime; dashboard only)
