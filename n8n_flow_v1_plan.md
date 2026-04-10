# n8n Flow v1 — Implementation Plan

**Platform**: n8n self-hosted or cloud.
**Trigger**: Messenger Send/Receive API webhook.
**Backend**: Google Sheets (`OneLifeCare_Master_Sheet_v24_runtime_ready.xlsx` published as a Google Sheet).
**Auth**: Google Sheets OAuth2 credential in n8n + Messenger Page Access Token in n8n credentials.

This plan describes a single workflow (`wf_runtime_v1`) with inline branches. No sub-workflows in v1.

---

## 0. Prerequisites

Before touching n8n:
- Real `Page_ID` and `Page_Access_Token` filled into `Pages` tab.
- Real page has a `BotControl` row with `AI_Enabled = Yes`.
- Facebook app in dev/live mode, webhook subscribed to `messages` and `messaging_postbacks`.
- Google Sheets API credential configured in n8n, scoped to the sheet.

---

## 1. Node-by-node flow

### Node 1 — `Webhook_Messenger` (Webhook trigger)
- **Type**: Webhook
- **Method**: POST
- **Path**: `/wh/messenger`
- **Response mode**: Respond Immediately with `200 OK` + `{"status":"ok"}`
- **Authentication**: Header auth using `X-Hub-Signature-256`
- **Notes**: Must also respond to the verification GET challenge from Facebook (separate webhook node if needed, or a function node that branches on method).

### Node 2 — `Extract_Event` (Function)
- **Reads**: webhook payload
- **Logic**:
  ```
  if (!body.entry || !body.entry[0].messaging) → stop
  for each entry.messaging[0]:
    out.page_id    = entry[0].id
    out.sender_psid = messaging.sender.id
    out.timestamp   = messaging.timestamp
    if (messaging.message && messaging.message.text):
      out.text = messaging.message.text
      out.is_message = true
    else:
      out.is_message = false
  ```
- **Writes**: nothing
- **Output**: one item with the extracted fields
- **Branching**: if `is_message = false` → route to `Stop_Silent` node

### Node 3 — `Read_Pages` (Google Sheets — Get Row)
- **Sheet**: `Pages`
- **Operation**: Lookup
- **Lookup column**: `Page_ID`
- **Lookup value**: `={{$json.page_id}}`
- **Return**: all columns
- **On empty**: route to `Fail_Unknown_Page` branch (writes Audit, stops)

### Node 4 — `Read_BotControl` (Google Sheets — Get Row)
- **Sheet**: `BotControl`
- **Operation**: Lookup
- **Lookup column**: `Page_ID`
- **Lookup value**: `={{$json.page_id}}`
- **On empty OR `AI_Enabled != Yes`**: route to `Stop_Bot_Off` (writes Audit, stops)

### Node 5 — `Read_Persona` (Google Sheets — Get Row)
- **Sheet**: `Personas`
- **Operation**: Lookup
- **Lookup column**: `Persona_ID`
- **Lookup value**: `={{$node["Read_Pages"].json.Assigned_Persona_ID}}`
- **On empty**: continue with neutral persona (warn in Audit, don't stop)

### Node 6 — `Read_ChatControl` (Google Sheets — Get Row)
- **Sheet**: `ChatControl`
- **Operation**: Lookup (composite key not supported natively → use the Search Rows with filter expression)
- **Filter**: `Thread_ID = {sender_psid} AND Page_ID = {page_id}`
- **On empty**: set `is_new = true`, `Chat_Stage = Opening`, `Collected_Fields_JSON = '{}'`
- **If `AI_Chat = OFF`**: route to `Stop_Chat_Off` (writes Audit, stops)

### Node 7 — `Load_Reference_Data` (Function, uses static workflow data for caching)
- **Purpose**: load and cache tabs the runtime re-reads on every turn
- **Uses n8n `static data`** to cache for 10 minutes
- **Cached tabs**:
  - `HealthGate`, `ShippingRules`
  - `Offers`, `Messages`, `Variants`
  - `ObjectionMediaLinks`, `MediaAssets`
  - `ENUMS` (specifically rows where `Category = Variants.Trigger_Keywords`)
- **On cache miss**: trigger a sub-sequence of Google Sheets `Get Rows` nodes (or use the "Get All Rows" once per tab)
- **Output**: merged object with `reference.*` keys available downstream

### Node 8 — `Health_Gate_Match` (Function)
- **Input**: `Collected_Fields_JSON` (parsed) + current message text
- **Logic**:
  ```
  haystack = current_text + ' ' + state.diagnosis.known_conditions + ' ' + any prior collected free text
  for row in reference.HealthGate:
    for alias in row.Condition_Aliases.split('|'):
      if haystack.includes(alias):
        return { matched: row }
  return { matched: null }
  ```
- **Output**: either `{ matched: null }` or `{ matched: { Condition_Name, Health_Category, AI_Action, Product_Path } }`

### Node 9 — `Stage_Resolver` (Function)
- **Input**: `ChatControl.Chat_Stage`, `Collected_Fields_JSON`, current message text, `reference.ENUMS.Variants.Trigger_Keywords`
- **Logic**: implement the intent classification table from `runtime_spec_v1.md § Step 4`
- **Output**: `{ intent, next_stage, matched_scenario_key?, needs_diagnosis_fields?, needs_booking_fields? }`

### Node 10 — `Switch_By_Intent` (Switch node)
- Routes to:
  - `B_health_blocked` (if Node 8 found a `Blocked` condition, overrides everything)
  - `B_doctor_required` (if `BFit_Doctor_First`)
  - `B_objection`
  - `B_recommendation`
  - `B_booking`
  - `B_diagnosis`
  - `B_product_inquiry`
  - `B_confused` (fallback)
  - `B_request_human`

### Branch B_health_blocked
- **B1 — `Read_Message_HealthBlocked`** (Sheets Lookup on `Messages` where `Scenario_Key = HEALTH_BLOCKED`)
- **B2 — `Build_HealthBlocked_Reply`** (Function — substitutes persona placeholders)
- **B3 — `Send_To_Messenger`** (HTTP Request)
- **B4 — `Write_Handoff_HealthBlocked`** (Append Row in `Handoffs` with `Reason_Type=Health_Blocked`)
- **B5 — `Write_ChatControl_AI_OFF`** (Update Row: `AI_Chat=OFF`, `Chat_Stage=Closed`)
- **B6 — `Write_Audit`** → merge to Node 20

### Branch B_doctor_required
- **D1 — `Read_Message_BFitDoctorFirst`**
- **D2 — `Build_DoctorFirst_Reply`**
- **D3 — `Send_To_Messenger`**
- **D4 — `Write_ChatControl_State`** (sets `state.health.requires_doctor = true`, keeps `AI_Chat = ON`)
- **D5 — `Write_Audit`** → merge to Node 20

### Branch B_objection
- **O1 — `Filter_Variants`** (Function — from cached `reference.Variants`, filter by matched `Scenario_Key` and `Active=Yes`)
- **O2 — `Pick_Variant_Rotation`** (Function — read `Audit` count for this `Thread_ID` + scenario, rotate)
- **O3 — `Substitute_Placeholders`** (Function — see § placeholder substitution)
- **O4 — `Filter_ObjectionMedia`** (Function — from cached `reference.ObjectionMediaLinks`, filter by scenario key)
- **O5 — `Resolve_Media_URLs`** (Function — join with `reference.MediaAssets`, skip placeholder URLs)
- **O6 — `Send_Reply_Text`** (HTTP Request to Messenger Send API)
- **O7 — `Send_Media_Loop`** (SplitInBatches + HTTP Request + Wait 1500ms)
- **O8 — `Write_ChatControl`** (update `Last_Action`, keep previous stage — don't stick in Objection)
- **O9 — `Write_Audit`** → merge to Node 20

### Branch B_recommendation
- **R1 — `Resolve_Target_Path`** (Function — reads `state.health.path`, defaults to `Normal_Offers`)
- **R2 — `Filter_Offers`** (Function — on cached `reference.Offers`: `Active=Yes AND Health_Path=target_path`)
- **R3 — `Pick_Best_Offer`** (Function — match `Internal_Recommendation` vs `state.diagnosis.target_weight_loss`)
- **R4 — `Build_Offer_Sequence`** (Function — produces an array following the LOCKED order):
  ```
  [
    { type:'text',  content: offer.Offer_Bot_Brief },
    { type:'image', media_id: offer.Main_Image_Media_ID, skip_if_placeholder: true },
    { type:'text',  content: offer.Offer_Why_Message },
    // components only if customer asked — checked via state.flags.asked_components
    ...components_block,
    // proof items from MediaAssets where Media_Group_ID = offer.Proof_Group_ID
    ...proof_items,
    { type:'text',  content: offer.Offer_Close_Question }
  ]
  ```
- **R5 — `Substitute_Placeholders`** (Function — runs on every `text` item in the sequence)
- **R6 — `Send_Sequence_Loop`** (SplitInBatches + HTTP Request + Wait 1500–2000ms)
- **R7 — `Write_ChatControl`** (update stage to `Recommendation`, store `last_recommended_offer_code` in state)
- **R8 — `Write_Audit`** → merge to Node 20

### Branch B_booking
- **BK1 — `Parse_Booking_Data`** (Function — try to extract phone, name, address, governorate from message using regex)
- **BK2 — `Merge_Into_State`** (Function — update `state.booking.*`)
- **BK3 — `Check_Completeness`** (Function — are all required booking fields present?)
- **BK4a — `Ask_Next_Field`** (Function — builds a short Arabic prompt for the first missing field)
- **BK4b — `Lookup_Shipping`** (Google Sheets Lookup on `ShippingRules.Governorate`) — only when complete
- **BK5 — `Upsert_OrdersDraft`** (Google Sheets Append or Update, match `Draft_ID=DRAFT-{sender_psid}`)
- **BK6 — `Build_Reply`** (Function — either "ask next field" or "order ready, confirmation pending")
- **BK7 — `Send_To_Messenger`**
- **BK8 — `If_Order_Ready_Create_Handoff`** (Append Row in `Handoffs` with `Reason_Type=Order_Ready`)
- **BK9 — `Write_ChatControl`**
- **BK10 — `Write_Audit`** → merge to Node 20

### Branch B_diagnosis
- **DG1 — `Parse_Diagnosis_Data`** (Function — extract weight, target loss, age clues)
- **DG2 — `Merge_Into_State`**
- **DG3 — `Check_Completeness`**
- **DG4a — `Ask_Next_Field`** (Arabic prompt for next missing diagnosis field)
- **DG4b — `Route_To_Recommendation`** (if complete → re-enter Node 10 via a loopback using `Execute Workflow` or inline continuation — in v1 we just send the "now let me recommend" transition message and wait for next customer message)
- **DG5 — `Send_To_Messenger`**
- **DG6 — `Write_ChatControl`**
- **DG7 — `Write_Audit`** → merge to Node 20

### Branch B_product_inquiry
- **P1 — `Read_Products`** (Sheets Get All Rows, filter by product name match)
- **P2 — `Build_Product_Blurb`** (Function — `Products.Notes` + `Default_Use` + bridge sentence)
- **P3 — `Send_To_Messenger`**
- **P4 — `Write_ChatControl`** (keep current stage, mark state flag `asked_product`)
- **P5 — `Write_Audit`** → merge to Node 20

### Branch B_confused
- **C1 — `Increment_Confused_Counter`** (Function — reads `state.confused_count`, increments)
- **C2 — `If_Confused_GE_3`** (IF node)
- **C2a — `Send_Confused_Reply`** (short Arabic "ممكن توضح أكتر؟") + `Write_ChatControl` + `Write_Audit`
- **C2b — `Escalate_Handoff`** (if counter ≥ 3): Append `Handoffs` row with `Reason_Type=Flow_Broken`, set `AI_Chat=OFF`, send a handoff acknowledgment message
- Merge to Node 20

### Branch B_request_human
- **H1 — `Send_Ack_Message`** ("لحظة ❤️ هحولك لحد من الفريق")
- **H2 — `Write_Handoff`** (`Reason_Type=Customer_Requested`)
- **H3 — `Write_ChatControl`** (`AI_Chat=OFF`, `Chat_Stage=Closed`)
- **H4 — `Write_Audit`** → merge to Node 20

### Node 20 — `Write_Audit_Final` (Google Sheets Append Row)
- Every branch merges here
- Appends one summary row to `Audit` with the turn's action, stage delta, and any error

### Node 21 — `Stop_Success`
- End of workflow

---

## 2. Error handling nodes

### `Fail_Unknown_Page`
- Writes `Audit` row: `Action=page_not_registered`, `Who=system`
- Sends no reply to customer
- Stops

### `Stop_Bot_Off`
- Writes `Audit` row: `Action=bot_disabled`
- Stops (no reply — human already handling)

### `Stop_Chat_Off`
- Writes `Audit` row: `Action=chat_ai_off_skip`
- Stops

### `Global_Error_Handler` (n8n workflow-level "On Error")
- Wraps Nodes 3–20
- On uncaught error:
  1. Send fallback reply `"لحظات ❤️ هرجعلك"` to customer
  2. Write `Handoffs` row with `Reason_Type=Runtime_Failure`, `Reason_Note={error message}`
  3. Flip `ChatControl.AI_Chat = OFF` for this thread
  4. Write `Audit` with `Action=error`
  5. Stop

---

## 3. Retry configuration

Apply to every Google Sheets node and the Messenger HTTP Request:
- **Max retries**: 3
- **Wait between retries**: 5 seconds
- **On final failure**: route to `Global_Error_Handler`

---

## 4. Placeholder substitution (Function node pattern)

Reusable JS snippet for any Function node that needs it:
```js
function substitute(text, state, offer) {
  if (!text) return '';
  const map = {
    '{customer_name}': state.booking?.customer_name || state.customer_name || '',
    '{goal}':          state.diagnosis?.goal || '',
    '{weight_target}': state.diagnosis?.target_weight_loss || '',
    '{area}':          state.diagnosis?.area || '',
    '{condition}':     state.diagnosis?.known_conditions?.[0] || '',
    '{governorate}':   state.booking?.governorate || '',
    '{offer_name}':    (offer?.Customer_Offer_Name || offer?.Offer_Name || ''),
    '{recommended_offer}': (offer?.Customer_Offer_Name || offer?.Offer_Name || ''),
  };
  let out = text;
  for (const k in map) out = out.split(k).join(map[k]);
  // collapse any leftover {xxx} placeholders
  out = out.replace(/\{[a-z_]+\}/gi, '').replace(/  +/g, ' ').trim();
  return out;
}
```

---

## 5. Minimal implementation order (build incrementally)

**Day 1 — Plumbing only**
1. Webhook node + verification challenge handling
2. `Extract_Event` + `Read_Pages` + `Read_BotControl` + `Read_ChatControl`
3. A single hardcoded "أهلاً، هساعدك ❤️" reply sent via Messenger
4. `Write_ChatControl` on upsert
5. `Write_Audit` on every turn
6. **Goal**: send a message to the test page, see it arrive in `ChatControl` + `Audit`

**Day 2 — Health + Stage**
7. `Load_Reference_Data` with cached `HealthGate`, `ENUMS`
8. `Health_Gate_Match` + `B_health_blocked` branch fully working
9. `Stage_Resolver` with greeting/diagnosis/objection/confused intents
10. `B_diagnosis` branch (collect weight + target loss only, store in state)
11. **Goal**: a test chat can go Opening → Diagnosis → receives "now recommending" stub

**Day 3 — Recommendation**
12. Cache `Offers` + `MediaAssets`
13. `B_recommendation` branch with the full 6-step sequence
14. Placeholder substitution
15. **Goal**: bot sends a complete offer correctly for a normal-path test customer

**Day 4 — Objections + Booking**
16. `B_objection` branch with variant rotation and ObjectionMediaLinks
17. `B_booking` branch with ShippingRules lookup and `OrdersDraft` write
18. `Handoffs` writes for `Order_Ready`, `Customer_Requested`
19. **Goal**: end-to-end happy path produces a ready order in the dashboard

**Day 5 — Failure + polish**
20. `Global_Error_Handler` + fallback reply
21. Retries on all Sheets and HTTP nodes
22. `B_confused` counter + `Flow_Broken` handoff
23. QA test with 20 manual test chats
24. **Goal**: runtime is safe to flip `AI_Enabled=Yes` on the real page

---

## 6. Things NOT to build in v1

- Separate sub-workflows (keep everything in one workflow for debuggability)
- LLM-based intent classification (use keyword + regex only)
- Multi-page parallel handling (each webhook invocation handles one page)
- Rich Messenger cards, quick replies, or carousels
- Automatic `OrdersMaster` creation
- Feedback loop writing back to `Training` or `AiCorrections`
- Rate limiting / throttling (not needed at pilot volume)
- Sheet-to-Sheet sync (the sheet is the single source of truth)
