\# One Life Care AI Agent



Internal AI sales agent system for a weight-loss business.



\## Current Project State



This repo contains the current dashboard reference, the runtime-ready master sheet, and the planning documents for Runtime v1.



\## Core Business Rules



\- Main selling flow = Offers

\- Products are internal/support layer + direct product inquiries only

\- Special-path offers must appear to the customer with normal customer-facing names

\- Bot tone must be:

&#x20; - confident

&#x20; - short

&#x20; - sales-oriented

&#x20; - Egyptian Arabic

\- If bot is confused or flow breaks, create handoff to sales

\- Handoff should be rare, not default



\## Important Field Rule



\- Keep `Offer\_Why\_Message` as the official field name

\- `Offer\_Bot\_Followup` is only a documentation alias



\## Repo Purpose



This repo is for implementing Runtime v1 in phases.



\## Phase 1 Goal



Build the first working plumbing loop:



1\. Receive incoming message via webhook

2\. Read:

&#x20;  - Pages

&#x20;  - BotControl

&#x20;  - ChatControl

3\. Check page active / AI enabled

4\. Create chat state if new

5\. Send static greeting reply

6\. Write back to:

&#x20;  - ChatControl

&#x20;  - Action\_Log



\## Files Expected In Repo



\### Root

\- AGENTS.md

\- README.md



\### Reference files

\- OneLifeCare\_AI\_Agent\_Dashboard\_v18\_fixed.html

\- OneLifeCare\_Master\_Sheet\_v24\_runtime\_ready.xlsx



\### Docs

\- runtime\_spec\_v1.md

\- dashboard\_sheet\_mapping.md

\- n8n\_flow\_v1\_plan.md

\- field\_mapping.md



\## Not In Scope Yet



Do NOT implement yet:

\- HealthGate logic

\- Offer recommendation logic

\- Variants logic

\- Orders\_Draft flow

\- Handoffs full flow

\- Dashboard redesign

\- Training / AI corrections loop



\## Next Step



Start with Phase 1 only.

After Phase 1 loop is proven, move to:

\- persona/context loading

\- stage handling

\- offer recommendation

\- objections

\- booking

