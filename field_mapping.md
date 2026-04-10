# Field Mapping — Runtime v1

Source: `OneLifeCare_Master_Sheet_v24_runtime_ready.xlsx`

Legend:
- **RT-R** = Runtime reads this field
- **RT-W** = Runtime writes this field
- **DB-R** = Dashboard reads this field
- **DB-W** = Dashboard writes this field
- **—** = not used by the marked side

Only fields that matter to runtime v1 are listed in detail. Fields not in the list still exist in the tab but are either dashboard-only or reserved for future use.

---

## Pages

| Field | RT-R | RT-W | DB-R | DB-W | Notes |
|---|---|---|---|---|---|
| `Page_ID` | ✅ | — | ✅ | ✅ | Primary key. Must be real Facebook page ID before pilot. |
| `Page_Name` | — | — | ✅ | ✅ | Display only. |
| `Page_Name_Short` | — | — | ✅ | ✅ | Shown in header. |
| `Page_Access_Token` | ✅ | — | ✅ | ✅ | Needed for Messenger Send API calls. Stored in sheet for v1; should move to n8n credentials later. |
| `Team_Name` | ✅ | — | ✅ | ✅ | Copied to `OrdersDraft.Team_Name`. |
| `AI_Page` | — | — | ✅ | ✅ | Not used by runtime (runtime uses `BotControl` instead). |
| `Page_Status` | ✅ | — | ✅ | ✅ | Runtime stops if not `Active`. |
| `Assigned_Persona_ID` | ✅ | — | ✅ | ✅ | Resolves which persona the bot speaks as. |

## Personas

| Field | RT-R | RT-W | DB-R | DB-W | Notes |
|---|---|---|---|---|---|
| `Persona_ID` | ✅ | — | ✅ | ✅ | Primary key. |
| `Persona_Name` | ✅ | — | ✅ | ✅ | Used as `{persona_name}` placeholder and in escalation messages. |
| `Intro_Message` | ✅ | — | ✅ | ✅ | Sent on first greeting turn. |
| `If_Asked_Who_Are_You` | ✅ | — | ✅ | ✅ | Triggered by keyword "مين انتي / بوت / روبوت". |
| `If_Asked_Are_You_Bot` | ✅ | — | ✅ | ✅ | Same trigger as above. |
| `Escalation_Message` | ✅ | — | ✅ | ✅ | Sent before any handoff. |
| `Tone_Notes` | — | — | ✅ | ✅ | Dashboard only; for human copywriters. |
| `Active` | ✅ | — | ✅ | ✅ | Runtime filters `Active = Yes`. |

## BotControl ⭐

| Field | RT-R | RT-W | DB-R | DB-W | Notes |
|---|---|---|---|---|---|
| `Page_ID` | ✅ | — | ✅ | ✅ | Primary key. |
| `AI_Enabled` | ✅ | — | ✅ | ✅ | Runtime stops entirely if `No`. Dashboard AI on/off toggle writes here. |
| `Reason` | — | ✅ | ✅ | ✅ | Runtime writes on auto-disable (runtime_failure, mass errors). |
| `Updated_At` | — | ✅ | ✅ | ✅ | Runtime writes timestamp when it disables itself. |

## Offers ⭐⭐

| Field | RT-R | RT-W | DB-R | DB-W | Notes |
|---|---|---|---|---|---|
| `Offer_Code` | ✅ | — | ✅ | ✅ | Primary key. Copied to `OrdersDraft.Offer_Code`. |
| `Offer_Bot_Brief` | ✅ | — | ✅ | ✅ | **Message #1** in locked sequence. |
| `Offer_Why_Message` | ✅ | — | ✅ | ✅ | **Message #3** in locked sequence. (Spec alias: `Offer_Bot_Followup`.) |
| `Offer_Close_Question` | ✅ | — | ✅ | ✅ | **Message #6** in locked sequence. |
| `Customer_Offer_Name` | ✅ | — | ✅ | ✅ | **Always use this when rendering offer to customer.** Especially for Special path. |
| `Recommended_For` | ✅ | — | ✅ | ✅ | Shown in admin, also used as fallback context for `{goal}`. |
| `Main_Image_Media_ID` | ✅ | — | ✅ | ✅ | **Message #2** in locked sequence. Resolved against `MediaAssets`. |
| `Proof_Group_ID` | ✅ | — | ✅ | ✅ | **Message #5** proof pack. Joins to `MediaAssets.Media_Group_ID`. |
| `Offer_Notes_For_Agent` | — | — | ✅ | ✅ | Dashboard / operator only. |
| `Page_ID` | ✅ | — | ✅ | ✅ | `null` or empty means shared across all pages. |
| `Scope` | ✅ | — | ✅ | ✅ | `Shared` or page-specific. |
| `Offer_Name` | ✅ | — | ✅ | ✅ | Internal name. Never sent to customer when `Health_Path = Special_Medical_Path`. |
| `Offer_Type` | ✅ | — | ✅ | ✅ | `Single` / `Package` / `Special`. |
| `Duration` | ✅ | — | ✅ | ✅ | Used in text generation. |
| `Internal_Recommendation` | ✅ | — | ✅ | ✅ | Runtime matches customer's target weight loss against this text field. |
| `Public_Weight_Text` | ✅ | — | ✅ | ✅ | Shown to customer. |
| `Components` | ✅ | — | ✅ | ✅ | Used when customer asks about components (short version). |
| `Price` | ✅ | — | ✅ | ✅ | Copied to `OrdersDraft.Offer_Price`. |
| `Old_Price` | — | — | ✅ | ✅ | Display only. |
| `Health_Path` | ✅ | — | ✅ | ✅ | `Normal_Offers` or `Special_Medical_Path`. Runtime uses to filter. |
| `Fallback_Allowed` | ✅ | — | ✅ | ✅ | If `Yes`, runtime may switch to `Fallback_To` on price objection. |
| `Fallback_To` | ✅ | — | ✅ | ✅ | Offer code to fall back to. |
| `Active` | ✅ | — | ✅ | ✅ | Runtime filters `Active = Yes`. |

## Messages

| Field | RT-R | RT-W | DB-R | DB-W | Notes |
|---|---|---|---|---|---|
| `Message_ID` | — | — | ✅ | ✅ | Primary key. Runtime looks up by `Scenario_Key`, not by ID. |
| `Page_ID` | ✅ | — | ✅ | ✅ | `null` = shared. |
| `Scope` | ✅ | — | ✅ | ✅ | `Shared` or page-specific. |
| `Stage` | ✅ | — | ✅ | ✅ | Filters by stage context. |
| `Scenario_Key` | ✅ | — | ✅ | ✅ | Runtime lookup key. Values used: `HEALTH_BLOCKED`, `BFIT_DOCTOR_FIRST`, `BFIT_ONLY`, `COMPONENTS_EXPLAINER`, `DATA_REQUEST`, `DELIVERY_INSTRUCTIONS`, `OPENING_OFFERS`, `OPENING_PROOF_PACK`, `WEIGHT_EXPECTATION`, `OFFERS_PRICES`. |
| `Message_Text` | ✅ | — | ✅ | ✅ | Sent as-is after placeholder substitution. |
| `Active` | ✅ | — | ✅ | ✅ | Filter. |

## Blocks

Runtime v1 does not use the Blocks tab directly — it reads `Messages` by `Scenario_Key`. Blocks is a dashboard organizational layer only.

| Field | RT-R | RT-W | DB-R | DB-W |
|---|---|---|---|---|
| All columns | — | — | ✅ | ✅ |

## Variants ⭐

| Field | RT-R | RT-W | DB-R | DB-W | Notes |
|---|---|---|---|---|---|
| `Variant_ID` | — | — | ✅ | ✅ | Primary key. Runtime doesn't need it. |
| `Page_ID` | ✅ | — | ✅ | ✅ | Scoping. |
| `Stage` | ✅ | — | ✅ | ✅ | Usually `Objection`. |
| `Scenario_Key` | ✅ | — | ✅ | ✅ | Runtime filter key. |
| `Variant_No` | ✅ | — | ✅ | ✅ | Used for rotation ordering. |
| `Reply_Text` | ✅ | — | ✅ | ✅ | Sent after placeholder substitution. |
| `When_To_Use` | — | — | ✅ | ✅ | Internal note only. Dashboard shows it. Runtime ignores. |
| `Selection_Logic` | ✅ | — | ✅ | ✅ | Only `Rotating` honored in v1. |
| `Active` | ✅ | — | ✅ | ✅ | Filter. |

## ObjectionMediaLinks

| Field | RT-R | RT-W | DB-R | DB-W | Notes |
|---|---|---|---|---|---|
| `Link_ID` | — | — | ✅ | ✅ | PK. |
| `Scenario_Key` | ✅ | — | ✅ | ✅ | Join key. |
| `Media_ID` | ✅ | — | ✅ | ✅ | Joins to `MediaAssets`. |
| `Order` | ✅ | — | ✅ | ✅ | Sending order. |
| `Active` | ✅ | — | ✅ | ✅ | Filter. |

## MediaAssets

| Field | RT-R | RT-W | DB-R | DB-W | Notes |
|---|---|---|---|---|---|
| `Media_ID` | ✅ | — | ✅ | ✅ | Primary key. |
| `Page_ID` | ✅ | — | ✅ | ✅ | Scoping. |
| `Scope` | ✅ | — | ✅ | ✅ | — |
| `Media_Type` | ✅ | — | ✅ | ✅ | Used for deciding Messenger attachment type (image/video). |
| `Use_Stage` | — | — | ✅ | ✅ | Dashboard filter only. |
| `Title` | — | — | ✅ | ✅ | Display only. |
| `File_URL` | ✅ | — | ✅ | ✅ | **Must be real URL.** Runtime skips if value equals `PUT_URL_HERE`. |
| `Media_Group_ID` | ✅ | — | ✅ | ✅ | Joins to `Offers.Proof_Group_ID`. |
| `Min_Send_Count` | ✅ | — | ✅ | ✅ | Lower bound of proof pack size. |
| `Max_Send_Count` | ✅ | — | ✅ | ✅ | Upper bound of proof pack size. |
| `Active` | ✅ | — | ✅ | ✅ | Filter. |

## AssetLinks

Runtime v1 does not use AssetLinks directly. This tab maps `Messages` ↔ `MediaAssets` for the dashboard's Quick Attach feature. If a runtime message (e.g., `HEALTH_BLOCKED`) needs to also send media, runtime v1 reads `MediaAssets` directly by `Scenario_Key` filter, not through AssetLinks.

## HealthGate ⭐⭐

| Field | RT-R | RT-W | DB-R | DB-W | Notes |
|---|---|---|---|---|---|
| `Condition_Name` | ✅ | — | ✅ | ✅ | Used in placeholder `{condition}` and in `Health_Note`. |
| `Health_Category` | ✅ | — | ✅ | ✅ | Drives runtime branching: `Blocked` / `BFit_Doctor_First` / `BFit_Only` / `Normal`. |
| `Product_Path` | ✅ | — | ✅ | ✅ | Joins to `Offers.Health_Path`. |
| `Doctor_Required` | ✅ | — | ✅ | ✅ | Used in reply composition. |
| `AI_Action` | ✅ | — | ✅ | ✅ | Runtime honors: `Stop`, `Recommend_BFit_With_Doctor`, `Route_Special_Path`, `Continue`. |
| `Condition_Aliases` | ✅ | — | ✅ | ✅ | **Pipe-separated** keyword list. Runtime's primary matching input. |

## ShippingRules

| Field | RT-R | RT-W | DB-R | DB-W | Notes |
|---|---|---|---|---|---|
| `Shipping_Rule_ID` | — | — | ✅ | ✅ | PK. |
| `Page_ID` | ✅ | — | ✅ | ✅ | Scoping. |
| `Scope` | ✅ | — | ✅ | ✅ | — |
| `Governorate` | ✅ | — | ✅ | ✅ | Lookup key. Runtime matches customer's entered governorate. |
| `Shipping_Price` | ✅ | — | ✅ | ✅ | Copied to `OrdersDraft.Shipping_Price`. |
| `Delivery_Time` | ✅ | — | ✅ | ✅ | Used in reply text. |
| `Prepayment_Required` | ✅ | — | ✅ | ✅ | May trigger a confirmation question. |
| `Prepayment_Type` | ✅ | — | ✅ | ✅ | — |
| `Shipping_Type` | — | — | ✅ | ✅ | — |
| `Notes` | ✅ | — | ✅ | ✅ | Optional inclusion in reply. |

## ChatControl ⭐⭐

| Field | RT-R | RT-W | DB-R | DB-W | Notes |
|---|---|---|---|---|---|
| `Thread_ID` | ✅ | ✅ | ✅ | ✅ | PK (composite with Page_ID). Runtime sets to Messenger `sender.id`. |
| `Page_ID` | ✅ | ✅ | ✅ | ✅ | PK. |
| `Customer_Name` | ✅ | ✅ | ✅ | ✅ | Runtime updates when collected in Booking. |
| `Phone_1` | — | ✅ | ✅ | ✅ | Runtime writes on Booking collection. |
| `AI_Chat` | ✅ | ✅ | ✅ | ✅ | Runtime stops if `OFF`. Runtime sets to `OFF` on health-block or flow-broken handoff. Dashboard can flip manually. |
| `AI_Chat_OFF_Reason` | — | ✅ | ✅ | ✅ | Runtime fills when it disables. |
| `Chat_Stage` | ✅ | ✅ | ✅ | ✅ | Runtime reads and writes on every turn. |
| `Assigned_To` | — | — | ✅ | ✅ | Dashboard operator assignment. |
| `Last_Action` | — | ✅ | ✅ | ✅ | Runtime writes short tag on every turn. |
| `Collected_Fields_JSON` | ✅ | ✅ | — | — | **Runtime's only session store.** JSON blob holding `state.diagnosis.*`, `state.booking.*`, `state.flags.*`, `state.health.*`, `state.confused_count`, `state.last_recommended_offer_code`. |
| `Handoff_ID` | — | ✅ | ✅ | ✅ | Runtime links to created Handoff row. |
| `Is_Archived` | — | — | ✅ | ✅ | Dashboard filter. |
| `Archived_At` | — | — | ✅ | ✅ | — |

## OrdersDraft ⭐

| Field | RT-R | RT-W | DB-R | DB-W | Notes |
|---|---|---|---|---|---|
| `Draft_ID` | ✅ | ✅ | ✅ | ✅ | PK. Runtime uses `DRAFT-{sender_psid}`. |
| `Created_At` | — | ✅ | ✅ | ✅ | Runtime sets on insert. |
| `Last_Updated_At` | — | ✅ | ✅ | ✅ | Runtime sets on every upsert. |
| `Page_ID` | — | ✅ | ✅ | ✅ | — |
| `Page_Name` | — | ✅ | ✅ | ✅ | Copied from `Pages`. |
| `Team_Name` | — | ✅ | ✅ | ✅ | Copied from `Pages`. |
| `Customer_Name` | — | ✅ | ✅ | ✅ | From `Collected_Fields_JSON`. |
| `Phone_1` | — | ✅ | ✅ | ✅ | — |
| `Phone_2` | — | ✅ | ✅ | ✅ | Optional. |
| `Governorate` | — | ✅ | ✅ | ✅ | — |
| `Area` | — | ✅ | ✅ | ✅ | — |
| `Full_Address` | — | ✅ | ✅ | ✅ | — |
| `Order_Items` | — | ✅ | ✅ | ✅ | Built from Offer_Items or free text. |
| `Offer_Code` | — | ✅ | ✅ | ✅ | — |
| `Offer_Bot_Brief` | — | ✅ | ✅ | ✅ | Snapshot of what was sent. |
| `Recommended_For` | — | ✅ | ✅ | ✅ | Snapshot. |
| `Main_Image_Media_ID` | — | ✅ | ✅ | ✅ | Snapshot. |
| `Proof_Group_ID` | — | ✅ | ✅ | ✅ | Snapshot. |
| `Offer_Notes_For_Agent` | — | ✅ | ✅ | ✅ | Snapshot. |
| `Offer_Name` | — | ✅ | ✅ | ✅ | **Use `Customer_Offer_Name`** for customer-facing text; `Offer_Name` is the internal snapshot for the operator. |
| `Offer_Price` | — | ✅ | ✅ | ✅ | — |
| `Shipping_Price` | — | ✅ | ✅ | ✅ | From `ShippingRules`. |
| `Total_Text` | — | ✅ | ✅ | ✅ | Computed string. |
| `Notes` | — | ✅ | ✅ | ✅ | From customer free text. |
| `Account_Name` | — | — | ✅ | ✅ | Operator-filled. |
| `Agent_Name` | — | — | ✅ | ✅ | Operator-filled. |
| `Health_Note` | — | ✅ | ✅ | ✅ | Runtime fills if HealthGate matched. |
| `AI_Chat` | — | ✅ | ✅ | ✅ | Mirrors `ChatControl.AI_Chat`. |
| `Chat_Stage` | — | ✅ | ✅ | ✅ | Mirrors `ChatControl.Chat_Stage`. |
| `Order_Status` | — | ✅ | ✅ | ✅ | Runtime sets `Ready` when booking complete. Operator moves to `Confirmed` / `Cancelled`. |
| `Delivery_Instructions_Sent` | — | — | ✅ | ✅ | Operator action. |
| `WhatsApp_Order_Form` | — | ✅ | ✅ | ✅ | Runtime builds plain-text template when `Ready`. |
| `Customer_Order_Form` | — | ✅ | ✅ | ✅ | Same. |

## OrdersMaster

Runtime v1 **never writes to OrdersMaster**. Dashboard operator moves confirmed orders from `OrdersDraft` to `OrdersMaster` manually.

| Field | RT-R | RT-W | DB-R | DB-W |
|---|---|---|---|---|
| All columns | — | — | ✅ | ✅ |

## Handoffs ⭐

| Field | RT-R | RT-W | DB-R | DB-W | Notes |
|---|---|---|---|---|---|
| `Handoff_ID` | — | ✅ | ✅ | ✅ | Runtime generates `HAND-{yyyymmdd-hhmmss}-{hash}`. |
| `Created_At` | — | ✅ | ✅ | ✅ | — |
| `Page_ID` | — | ✅ | ✅ | ✅ | — |
| `Thread_ID` | — | ✅ | ✅ | ✅ | Links back to ChatControl. |
| `Customer_Name` | — | ✅ | ✅ | ✅ | If known. |
| `Phone_1` | — | ✅ | ✅ | ✅ | If known. |
| `Reason_Type` | — | ✅ | ✅ | ✅ | One of: `Health_Blocked`, `Doctor_Required`, `Flow_Broken`, `Customer_Requested`, `Order_Ready`, `Runtime_Failure`. |
| `Reason_Note` | — | ✅ | ✅ | ✅ | Free text context. |
| `Chat_Status` | — | ✅ | ✅ | ✅ | e.g., `Waiting_Human`. |
| `Assigned_To` | — | — | ✅ | ✅ | Operator sets. |
| `Handled` | — | — | ✅ | ✅ | Operator sets. |
| `Resolved_At` | — | — | ✅ | ✅ | Operator sets. |
| `Resolution_Note` | — | — | ✅ | ✅ | Operator sets. |

## Audit

| Field | RT-R | RT-W | DB-R | DB-W | Notes |
|---|---|---|---|---|---|
| `Audit_ID` | — | ✅ | ✅ | ✅ | Runtime generates. |
| `Created_At` | — | ✅ | ✅ | ✅ | — |
| `Entity` | — | ✅ | ✅ | ✅ | Runtime uses `runtime`, `chat`, `order`, `handoff`, `variant`, `message`. |
| `Record_ID` | — | ✅ | ✅ | ✅ | Thread_ID for runtime turns. |
| `Action` | — | ✅ | ✅ | ✅ | Runtime values: `received`, `replied`, `stage_change`, `health_block`, `handoff_created`, `order_ready`, `error`, `bot_disabled`, `chat_ai_off_skip`, `page_not_registered`. |
| `Who` | — | ✅ | ✅ | ✅ | Runtime uses `system`. |
| `OldValue` | — | ✅ | ✅ | ✅ | — |
| `NewValue` | — | ✅ | ✅ | ✅ | — |
| `Reason` | — | ✅ | ✅ | ✅ | Free text. |

## ENUMS ⭐

| Field | RT-R | RT-W | DB-R | DB-W | Notes |
|---|---|---|---|---|---|
| `Category` | ✅ | — | ✅ | ✅ | Runtime specifically reads rows where `Category = Variants.Trigger_Keywords`. |
| `Value` | ✅ | — | ✅ | ✅ | For trigger keywords rows: format `SCENARIO_KEY=kw1\|kw2\|kw3`. |

Runtime consumers:
- `Variants.Trigger_Keywords` — used by Stage Resolver for objection detection (already seeded in v24)
- All other ENUMS categories are dashboard-side validation only

## Products

| Field | RT-R | RT-W | DB-R | DB-W | Notes |
|---|---|---|---|---|---|
| `Product_ID` | ✅ | — | ✅ | ✅ | Matched by product inquiry branch. |
| `Product_Name` | ✅ | — | ✅ | ✅ | Matching input. |
| `Customer_Product_Name` | ✅ | — | ✅ | ✅ | Matching input + display. |
| `Product_Type` | — | — | ✅ | ✅ | Dashboard only. |
| `Form` | — | — | ✅ | ✅ | Dashboard only. |
| `Can_Sell_Alone` | — | — | ✅ | ✅ | Dashboard only (informational). |
| `Default_Use` | ✅ | — | ✅ | ✅ | Used in product blurb. |
| `Main_Image_Media_ID` | ✅ | — | ✅ | ✅ | Optional image for blurb. |
| `Notes` | ✅ | — | ✅ | ✅ | Main body of the blurb. |
| `Active` | ✅ | — | ✅ | ✅ | Filter. |

**Note**: Products tab has a description row at row 1 and actual headers at row 2. Runtime reads with header offset = 2.

## Offer_Items

Runtime v1 does not directly read Offer_Items. It's informational for the dashboard and for future v2 bundle math. Runtime uses `Offers.Components` string for quick reference.

| Field | RT-R | RT-W | DB-R | DB-W |
|---|---|---|---|---|
| All columns | — | — | ✅ | ✅ |

## Tabs not read or written by runtime v1

- `README_AR`
- `BACKLOG_TODO`
- `Users` (runtime has no user concept)
- `Training` (dashboard only)
- `AiCorrections` (future v2 feedback loop)
- `OrdersQuick` (not used)

---

## Summary table — runtime touch count

| Tab | Read every turn | Write conditionally | Cached |
|---|---|---|---|
| Pages | ✅ | — | 10 min |
| BotControl | ✅ | auto-disable only | 10 min |
| Personas | ✅ | — | 10 min |
| HealthGate | ✅ | — | 10 min |
| Offers | ✅ | — | 10 min |
| Messages | ✅ | — | 10 min |
| Variants | ✅ | — | 10 min |
| ObjectionMediaLinks | ✅ | — | 10 min |
| MediaAssets | ✅ | — | 10 min |
| ShippingRules | ✅ | — | 10 min |
| ENUMS | ✅ | — | 10 min |
| Products | conditional | — | 10 min |
| ChatControl | ✅ | ✅ every turn | ❌ never |
| OrdersDraft | — | ✅ booking stage | ❌ never |
| Handoffs | — | ✅ on trigger | ❌ never |
| Audit | — | ✅ every turn | ❌ never |
