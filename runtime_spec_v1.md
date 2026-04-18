# Runtime v1 Spec — One Life Care AI Agent

**Target**: Messenger webhook → deterministic reply → sheet write-back.
**Scope**: single-turn request/response, no agentic loops, no learning, no auto-confirmation of orders.
**Source of truth**: `OneLifeCare_Master_Sheet_v24_runtime_ready.xlsx` (the dashboard reads/writes the same tabs).
**Selling flow**: OFFERS is the main selling layer. Products are used for (a) direct product inquiries and (b) internal composition only. The offer-sending order is locked and must never be changed.

---

## 1. Fixed business constants

| Constant | Value |
|---|---|
| Primary selling layer | `Offers` tab |
| Offer sending order | Brief → Why → (Components if asked) → Proof → Close |
| Health path display rule | Always use `Customer_Offer_Name` for customer-facing text. Never show `Offer_Name` when `Health_Path = Special_Medical_Path`. |
| Max turns before auto-handoff | 3 consecutive "confused" turns |
| Max active persona per page | 1 |
| Max active offer recommendation per chat turn | 1 (with optional Fallback_To) |

**Alias note**: The business spec calls the 2nd message `Offer_Bot_Followup`. The sheet and dashboard both store it as `Offer_Why_Message`. Runtime v1 uses `Offer_Why_Message` as the canonical field; `Offer_Bot_Followup` is a documentation alias only. **Do not rename.**

---

## 1.A Operating Doctrine — Persona-driven, Dashboard-controlled, AI-assisted selling

This section is **binding on every later section** (intent, stage, offer, objection, booking, post-send) and on every code path in `src/`. Any implementation that contradicts it is out of spec, regardless of which step it lives under.

### Principle (one sentence)
The dashboard + the sheet are the sole source of truth for customer-facing content. The persona controls tone and identity. The AI is a selector and persuader on top of that truth — not an author of new truth.

### 1.A.1 Dashboard is the source of truth
All customer-facing content — offer names, prices, components, messages, variants, media, shipping values, health rules — originates from the dashboard and is persisted in the Google Sheet tabs (`Offers`, `Messages`, `Variants`, `MediaAssets`, `ShippingRules`, `HealthGate`, `Personas`, `Products`).

Runtime **reads** these tabs every turn (with the cache rules in § 3). Runtime **never invents** a value for any of these fields. If the dashboard does not carry a value, the runtime does not make one up — it either falls back to another valid sheet value, skips that step, or hands off.

### 1.A.2 Persona is runtime-relevant, not dashboard decoration
`Personas` is not cosmetic. It governs:
- identity (how the bot introduces itself — `Intro_Message`)
- tone (read from `Tone_Notes` + `Persona_Name`)
- self-identification answers (`If_Asked_Who_Are_You`, `If_Asked_Are_You_Bot`)
- escalation style (`Escalation_Message`)
- every placeholder-substituted reply rendered by the runtime

Runtime must resolve `Pages.Assigned_Persona_ID` → `Personas` row on **every turn** (cached per § 3) and route it through the reply renderer. A bot without persona data is a warning, not a success — log and continue with a neutral placeholder, never synthesize a persona identity.

### 1.A.3 AI scope — what the AI is allowed to do
The AI (current Gemini provider, future providers) is authorised to:

1. **Understand intent** — classify the customer turn (see § 4 intent table) and extract fields (weight, target loss, governorate, phone, etc.) into `state.*`.
2. **Choose the best valid offer** — but only from the `Offers` rows actually loaded into `business_context.offers` after the `Active=Yes` + `Health_Path` + `Page_ID/Shared` filters. The AI's `recommended_offer` output **must** match an `Offer_Code` from that pre-filtered set.
3. **Choose the best valid scenario/variant** — same rule, from `Messages`/`Variants` rows the runtime loaded.
4. **Do grounded persuasion** — frame value, highlight benefits, compare options, using `Customer_Offer_Name`, `Public_Weight_Text`, `Price`, `Components`, `Recommended_For`, `Internal_Recommendation`, `Health_Path` verbatim from the loaded rows.
5. **Do grounded comparisons** — e.g. "العرض X أوفر من العرض Y بكذا" only when the numbers are literally present in the sheet.
6. **Do grounded arithmetic** — e.g. "لو أخدتي 3 كورسات سعر الكورس الواحد يبقى X" **only if** X is computed from actual `Price` / `Components` values the runtime loaded. Never from invented numbers.

### 1.A.4 AI scope — what the AI is NOT allowed to do
The AI must **never** invent:
- offer names, product names, package names
- prices (current, old, bundle, or per-unit derivatives of imagined totals)
- package contents / components
- product claims or medical effects
- shipping values, governorate delivery times, prepayment rules
- persona identity details, titles, or credentials not in `Personas`
- `Scenario_Key` or `Offer_Code` values not found in the loaded context

If the AI does not have a grounded answer, acceptable fallbacks are: ask a clarifying question, re-route to an earlier stage, or request a human handoff. Fabrication is never an acceptable fallback.

### 1.A.5 Free-form generation is minimised
The preferred architecture is:
1. **Dashboard-controlled content** — the canonical text lives in `Offers.Offer_Bot_Brief`, `Offers.Offer_Why_Message`, `Offers.Offer_Close_Question`, `Messages.Message_Text`, `Variants.Reply_Text`. The runtime sends these after placeholder substitution (§ 8) with minimal or zero AI rewriting for critical sales steps.
2. **Persona-driven rendering** — tone/intro/escalation come from `Personas`, not from the AI improvising.
3. **AI-assisted selection and persuasion** — the AI's job is to pick the right row and wrap it in a persona-consistent bridge sentence, not to rewrite the row.

Free-form LLM replies are acceptable **only** for:
- the very first Opening ice-breaker when no prior state exists
- short clarifying questions during Diagnosis when the runtime genuinely needs one more field
- soft bridge sentences between dashboard-sourced messages

Free-form LLM replies are **not** acceptable for:
- the 6-step offer sequence (§ 6) — all items come from the sheet, in locked order
- objection responses (§ 7) — taken from `Variants.Reply_Text`
- booking data requests (§ 5 booking required fields list) — fixed prompts
- health-gate responses (§ 5 health gate) — taken from `Messages` by `Scenario_Key`
- post-send / delivery instructions — taken from `Messages`/`ShippingRules`

### 1.A.6 Grounded math rules
When the AI performs any numeric framing:
- Inputs must be values already loaded from the sheet in the current turn.
- The resulting string must be reproducible from those inputs — no rounding that hides the source, no unit change without explicit source.
- Currency, weight units, and counts must echo the sheet's wording.
- If any input is missing, the AI must drop the framing entirely, not estimate.

### 1.A.7 The locked selling flow is untouched by this doctrine
This doctrine **does not** change the flow:

```
Opening → Diagnosis → Recommendation → (Objection ↔ Recommendation)*
       → Booking → PostSend → Closed
```

Nor does it change the locked 6-step offer sequence (Brief → Image → Why → [Components if asked] → Proof → Close) in § 6. It strengthens them: every step in that flow must source its words from the dashboard, rendered in the active persona, with the AI doing selection + persuasion only.

### 1.A.8 Runtime self-check at integration boundaries
At each integration boundary the runtime must enforce this doctrine mechanically:
- **After the AI returns a decision**: if `recommended_offer` is non-empty, it must equal an `Offer_Code` from the pre-filtered offers list of the current turn. Otherwise drop it and log `grounding_reject` in `Audit.meta`.
- **After the AI returns `reply_text`**: for stages where free-form is not acceptable (§ 1.A.5), discard the AI's `reply_text` and send the dashboard-sourced text instead.
- **At placeholder substitution** (§ 8): unresolved placeholders collapse to empty, they are never left as `{xxx}` and never AI-filled.
- **At stage transition**: the stage transition table (enforced in `src/runtime.js`) stays the single authority. AI-proposed `next_stage` outside the allowed set is rejected (already live behaviour as of P1).

### 1.A.9 Contract summary
The runtime is:

> **Persona-driven + Dashboard-controlled + AI-assisted selling**

and must never become:

> freestyle LLM selling.

Any future PR that widens the AI's authoring surface beyond § 1.A.3 or narrows the dashboard's authority over § 1.A.1 is out of spec and must be rejected at review.

---

## 2. Runtime step-by-step

### Step 1 — Intake
- Webhook endpoint receives a Messenger event.
- Validate `X-Hub-Signature-256` against the page app secret.
- Accept only `messaging.message.text` events in v1. Ignore delivery receipts, read receipts, reactions, postbacks.
- Extract:
  - `page_id` from `entry[0].id`
  - `sender_psid` from `entry[0].messaging[0].sender.id` → used as `Thread_ID`
  - `text` from `entry[0].messaging[0].message.text`
  - `timestamp` from `entry[0].messaging[0].timestamp`
- Respond `200 OK` to Messenger immediately, continue processing asynchronously.

### Step 2 — Page + Persona + BotControl resolution
1. Read `Pages` where `Page_ID = {page_id} AND Page_Status = Active`.
   - Not found → write `Audit` row `(Entity=runtime, Action=page_not_registered)`, stop.
2. Read `BotControl` where `Page_ID = {page_id}`.
   - Not found → treat as `AI_Enabled = No`, log, stop.
   - `AI_Enabled = No` → log, stop (human will reply).
3. Read `Personas` where `Persona_ID = Pages.Assigned_Persona_ID`.
   - Not found → continue with a neutral persona name, log warning. Do NOT stop.

### Step 3 — Chat state lookup
1. Read `ChatControl` where `Thread_ID = {sender_psid} AND Page_ID = {page_id}`.
2. If not found → create new row:
   - `Thread_ID`, `Page_ID`
   - `AI_Chat = ON`
   - `Chat_Stage = Opening`
   - `Last_Action = intake_first`
   - `Collected_Fields_JSON = {}`
   - `Is_Archived = No`
3. If found and `AI_Chat = OFF` → log `bot_off_skip` in `Audit`, stop. Human already took over.
4. Parse `Collected_Fields_JSON` into a dict called `state`. Missing keys are allowed.

### Step 4 — Stage resolution
Allowed stages (from `ENUMS.Messages.Stage`): `Opening`, `Diagnosis`, `Recommendation`, `Objection`, `Booking`, `PostSend`, plus terminal `Closed`.

**Intent classification** (simple keyword + regex, no LLM required in v1):

| Intent | Detection |
|---|---|
| `greeting` | First message OR very short "السلام / اهلا / مرحبا / hi" |
| `product_inquiry` | Message contains a `Products.Product_Name` or `Customer_Product_Name` |
| `diagnosis_answer` | Message contains a number + "كيلو" OR weight/age keywords |
| `objection` | Message matches any pattern from `ENUMS.Variants.Trigger_Keywords` |
| `agree` | Message contains "تمام / موافق / هحجز / اكيد / ايوة اكمل" |
| `booking_data` | Current stage = `Booking` and message contains phone/address/name patterns |
| `request_human` | "محتاج اكلم حد / سيلز / اتكلم مع بني ادم" |
| `confused` | None of the above matched |

**Stage transitions**:

| Current | Intent | Next |
|---|---|---|
| Opening | greeting | Opening (send persona intro + short offers preview) |
| Opening | diagnosis_answer | Diagnosis |
| Opening | objection | Objection (return to Opening) |
| Opening | product_inquiry | Opening (answer inquiry, bridge back) |
| Diagnosis | diagnosis_answer | Diagnosis (collect more) or Recommendation (if complete) |
| Diagnosis | objection | Objection (return to Diagnosis) |
| Recommendation | objection | Objection (return to Recommendation) |
| Recommendation | agree | Booking |
| Recommendation | diagnosis_answer | Diagnosis (re-diagnose if new info changes recommendation) |
| Booking | booking_data | Booking (collect more) or PostSend (if complete) |
| Booking | objection | Objection (return to Booking) |
| any | request_human | Closed + Handoff |
| any | confused 3x in a row | Closed + Handoff |

**Diagnosis required fields** (must be collected before Recommendation):
- `current_weight` (kg)
- `target_weight_loss` (kg)
- `age_range` (one of: under_30, 30_50, over_50)
- `known_conditions` (free text, scanned by HealthGate)

Store these under `state.diagnosis.*` inside `Collected_Fields_JSON`.

**Booking required fields** (must be collected before PostSend):
- `customer_name`
- `phone_1`
- `governorate` (must match a row in `ShippingRules.Governorate`)
- `full_address`
- Optional: `phone_2`, `notes`

Store these under `state.booking.*`.

### Step 5 — Health Gate
Runs on every message, not just Diagnosis.

1. Load `HealthGate` (cache for 10 minutes).
2. Build a search haystack: `current message text + state.diagnosis.known_conditions + any previously collected free text`.
3. For each row in `HealthGate`, split `Condition_Aliases` by `|` and check if any alias is a substring of the haystack.
4. On first match, take the action in the `AI_Action` column:

| `Health_Category` | `AI_Action` | Runtime behavior |
|---|---|---|
| `Blocked` | `Stop` | Send `Messages` where `Scenario_Key = HEALTH_BLOCKED`. Set `Chat_Stage = Closed`. Create Handoff with `Reason_Type = Health_Blocked`. Do not recommend any offer. |
| `BFit_Doctor_First` | `Recommend_BFit_With_Doctor` | Send `Messages` where `Scenario_Key = BFIT_DOCTOR_FIRST`. Store `state.health.requires_doctor = true`. Do not recommend until customer confirms doctor approval. |
| `BFit_Only` | `Route_Special_Path` | Store `state.health.path = Special_Medical_Path`. Continue to Step 6 but filter offers by `Health_Path = Special_Medical_Path`. |
| `Normal` | `Continue` | Continue normal flow. |

**Customer-facing rule**: when the chat is on the special path, the offer reply uses `Customer_Offer_Name` in all rendered text. The internal `Offer_Name` is never displayed. `Health_Note` inside `OrdersDraft` may still use internal wording since sales team reads it.

### Step 6 — Offer resolution
Only runs when `Chat_Stage = Recommendation` (or on direct product inquiry).

**Direct product inquiry path**:
- Match message against `Products.Product_Name` / `Customer_Product_Name`.
- Reply with a short blurb built from `Products.Notes` + `Products.Default_Use`.
- Bridge: "وعندنا عرض كامل شامل المنتج ده، تحب أقولك عليه؟"
- Do NOT auto-send the full offer sequence yet. Wait for customer confirmation, then continue to Recommendation.

**Offer recommendation path**:
1. Determine `target_path`:
   - If `state.health.path = Special_Medical_Path` → `Special_Medical_Path`
   - Else → `Normal_Offers`
2. Filter `Offers` where `Active = Yes AND Health_Path = {target_path}`.
3. Pick the offer whose `Internal_Recommendation` best matches `state.diagnosis.target_weight_loss`.
   - v1 matching is string-based: look for digit ranges in `Internal_Recommendation` and pick the first containing the target.
   - Tie-breaker: lowest `Price`.
4. If no match → fall back to the offer marked as default (first active offer on the path).
5. If a chosen offer has `Fallback_To` set and customer later rejects on price, the fallback becomes the next recommendation.

**Send sequence (LOCKED ORDER)**:

| # | What | Source | Condition |
|---|---|---|---|
| 1 | Brief text | `Offers.Offer_Bot_Brief` | always |
| 2 | Main image | `MediaAssets` where `Media_ID = Offers.Main_Image_Media_ID` | if set and URL is not placeholder |
| 3 | Why message | `Offers.Offer_Why_Message` | always |
| 4 | Components explanation | `Messages` where `Scenario_Key = COMPONENTS_EXPLAINER` | only if customer asked OR intent = product_inquiry |
| 5 | Proof pack | `MediaAssets` where `Media_Group_ID = Offers.Proof_Group_ID`, take `Min_Send_Count..Max_Send_Count` items, respect `Active=Yes` | if a `Proof_Group_ID` is set |
| 6 | Close question | `Offers.Offer_Close_Question` | always |

Delays between sequence items: 1.5–3 seconds. Configurable per page later, hardcoded for v1.

### Step 7 — Objection resolution
Runs whenever intent = `objection`, regardless of stage.

1. Match message against `ENUMS.Variants.Trigger_Keywords` (format `SCENARIO_KEY=kw1|kw2|kw3`).
2. Pick the `Scenario_Key` with the most matched keywords (tie → first in sheet order).
3. Read `Variants` where `Scenario_Key = {matched} AND Active = Yes`.
4. Choose a reply:
   - v1 uses simple rotation. Count of previously used variants for this `Scenario_Key` on this `Thread_ID` comes from `Audit` where `Entity=variant AND Record_ID=Thread_ID`. Rotate by `(count % active_variants_count)`.
   - `Selection_Logic` column is read but only `Rotating` is honored in v1.
5. Substitute placeholders in `Reply_Text` (see Step 8).
6. Read `ObjectionMediaLinks` where `Scenario_Key = {matched} AND Active = Yes`, ordered by `Order`.
7. For each linked media, resolve `MediaAssets.File_URL`. Skip placeholder URLs.
8. Send reply text, then attached media in order.
9. **Return** the chat to its previous `Chat_Stage` (do NOT get stuck in Objection).

If no keyword match but intent was still classified as objection (fallback), send the `COMPETITOR_Q` variant as a generic reassurance, or escalate after 2 misses.

### Step 8 — Response build (placeholder substitution)
Both offer text and variant text support these placeholders. All substitutions read from `state` (the parsed `Collected_Fields_JSON`) + the current offer context:

| Placeholder | Source |
|---|---|
| `{customer_name}` | `state.booking.customer_name` → else `ChatControl.Customer_Name` → else empty |
| `{goal}` | `state.diagnosis.goal` (free text, optional) |
| `{weight_target}` | `state.diagnosis.target_weight_loss` |
| `{area}` | `state.diagnosis.area` (optional) |
| `{condition}` | `state.diagnosis.known_conditions` first matched HealthGate condition name |
| `{governorate}` | `state.booking.governorate` |
| `{offer_name}` | Current offer's `Customer_Offer_Name` if present, else `Offer_Name` |
| `{recommended_offer}` | Same as `{offer_name}` |

**Unresolved placeholder rule**: if a placeholder has no value in state, remove the braces and the placeholder token entirely. Never send `{xxx}` to a customer. Collapse resulting double spaces.

### Step 9 — Write-back rules
Every webhook turn writes to these tabs in this order:

1. **`ChatControl`** (always)
   - Upsert by `(Thread_ID, Page_ID)`
   - Update: `Chat_Stage`, `Last_Action`, `Collected_Fields_JSON`
   - On first-ever contact: insert with defaults (see Step 3)

2. **`OrdersDraft`** (only if stage transitions into Booking or is already Booking)
   - Upsert by `Draft_ID = DRAFT-{sender_psid}`
   - On first Booking turn: insert with `Created_At`, `Page_ID`, `Page_Name`, `Team_Name`, `Offer_Code`, `Offer_Name`, `Offer_Bot_Brief`, `Recommended_For`, `Main_Image_Media_ID`, `Proof_Group_ID`, `Offer_Price`, `Health_Note` (if from Health Gate)
   - Update as booking fields are collected: `Customer_Name`, `Phone_1`, `Phone_2`, `Governorate`, `Area`, `Full_Address`, `Shipping_Price` (looked up from `ShippingRules`), `Total_Text`, `Notes`
   - When all required booking fields are collected: set `Order_Status = Ready`, populate `WhatsApp_Order_Form` and `Customer_Order_Form` (plain text templates)
   - **Do NOT copy to `OrdersMaster` automatically.** A sales operator confirms via the dashboard.

3. **`Handoffs`** (only if triggered — see Step 10)
   - Insert a new row with `Handoff_ID = HAND-{yyyymmdd-hhmmss}-{short hash}`
   - Link back: set `ChatControl.Handoff_ID` to the new ID

4. **`Audit`** (always, minimum 1 row per turn)
   - Entity: `runtime`, Action: one of `received`, `replied`, `stage_change`, `health_block`, `handoff_created`, `order_ready`, `error`
   - Record_ID: `Thread_ID`
   - Who: `system`
   - Old/New values: relevant state deltas

### Step 10 — Handoff rules
Create a `Handoffs` row with the matching `Reason_Type` when ANY of these fires:

| Reason_Type | Trigger |
|---|---|
| `Health_Blocked` | HealthGate matched a `Blocked` condition |
| `Doctor_Required` | HealthGate matched a `BFit_Doctor_First` condition and customer didn't confirm doctor approval within 3 turns |
| `Flow_Broken` | 3 consecutive `confused` intents on same thread |
| `Customer_Requested` | Intent = `request_human` |
| `Order_Ready` | `OrdersDraft.Order_Status` just flipped to `Ready` |
| `Runtime_Failure` | Sheet read/write retries exhausted, or empty response built |

After a `Health_Blocked` or `Flow_Broken` handoff, set `ChatControl.AI_Chat = OFF` so subsequent messages bypass the bot until a human clears it from the dashboard. For `Order_Ready` and `Customer_Requested`, keep `AI_Chat = ON` but set `Chat_Stage` appropriately so the sales operator can still see the thread.

### Step 11 — Failure handling
| Failure | Action |
|---|---|
| Webhook signature invalid | Return 403, do nothing |
| Non-message event | Return 200, do nothing |
| Google Sheets read error | Retry 2x with 5s backoff. If still fails → fallback reply `"لحظات ❤️ هرجعلك"` + `Handoffs` row with `Reason_Type = Runtime_Failure` |
| Google Sheets write error | Retry 2x. If still fails → log to `Audit` with `Action=error`, continue (don't double-send to customer) |
| Response builder returns empty string | Do not send. Create `Handoffs` with `Reason_Type = Runtime_Failure` |
| Unknown `Scenario_Key` from objection match | Log warning, fall back to `COMPETITOR_Q` or generic reassurance |
| Missing `Offers.Main_Image_Media_ID` or placeholder URL | Skip image step, continue sequence |
| `ShippingRules` has no row for customer's governorate | Ask customer to confirm governorate once; if still no match → `Handoff` with `Reason_Type = Flow_Broken`, note = `unknown_governorate` |

---

## 3. Caching strategy (in-memory only, no Redis in v1)

The runtime is allowed to cache these read-only tabs inside the n8n workflow's static memory for 10 minutes:
- `Pages`, `Personas`, `BotControl`
- `HealthGate`, `ShippingRules`
- `Offers`, `Messages`, `Variants`, `ObjectionMediaLinks`, `MediaAssets`
- `ENUMS`

**Never cache**: `ChatControl`, `OrdersDraft`, `Handoffs`, `Audit`. These must always be fresh reads/writes.

---

## 4. Non-goals for v1 (explicitly out of scope)
- Multi-persona switching inside a single chat
- Product bundles / Bundles tab
- Automatic `OrdersMaster` confirmation
- Learning / feedback loop from `AiCorrections`
- Multi-page load balancing
- Rich Messenger cards (v1 sends plain text + images only)
- Voice message handling
- Arabic dialect translation for non-Egyptian customers
