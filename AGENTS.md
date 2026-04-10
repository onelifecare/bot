\# AGENTS.md



\## Project Rules



\- Do not redesign the dashboard UI.

\- Do not create a new sheet.

\- Keep the current architecture and business flow.

\- Main selling flow = Offers.

\- Products are internal/support layer + direct product inquiries only.

\- Keep customer-facing names normal for special-path offers.

\- Keep `Offer\_Why\_Message` as-is. Do not rename it.

\- Use Egyptian Arabic for customer-facing text.

\- Keep changes minimal and backward-compatible.

\- Build in phases.

\- Start with Phase 1 plumbing only.



\## Phase 1 Scope



Phase 1 only includes:

1\. Receive incoming message via webhook

2\. Read from sheet:

&#x20;  - Pages

&#x20;  - BotControl

&#x20;  - ChatControl

3\. If page is inactive or AI disabled -> log and stop

4\. If chat is new -> create initial chat state

5\. Send a static greeting reply in Egyptian Arabic

6\. Write back to:

&#x20;  - ChatControl

&#x20;  - Action\_Log



\## Do Not Implement Yet



\- HealthGate logic

\- Offer recommendation logic

\- Products logic

\- Variants logic

\- Objection media logic

\- Orders\_Draft

\- Handoffs except failure placeholders

\- Dashboard UI changes

\- AiCorrections / Training



\## Notes



\- `Offer\_Bot\_Followup` in docs = `Offer\_Why\_Message` in actual sheet/dashboard.

\- Do not touch dashboard UI until runtime v1 is proven.

\- Keep implementation practical and minimal.

