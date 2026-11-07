# Owner booking changes — November 7, 2026

Implemented in MAIN and ADMIN. Migrations 045 and 046 were applied together to the shared production database on November 7, 2026 after a successful rollback rehearsal. Customer and Admin sites were both published successfully through their existing Vercel integrations.

Applied `supabase/migrations/202611070045_owner_booking_updates.sql` after 044, followed by `202611070046_drawn_electronic_signatures.sql`, in one transaction before publishing either app. The migration retires old areas for new bookings and inserts the five owner-approved areas and rates. Existing booking prices, deposit custody records and terms acceptance records are preserved.

One service charge covers delivery and pickup: Lapu-Lapu ₱300; Airport ₱350; Mandaue ₱400; Cebu City ₱500; Cebu Port (Pier 1–5) ₱500. Different-area bookings use the higher rate (implementation assumption requiring owner review). A one-direction service uses the same area rate. Accounting allocates the rate to delivery first, with only any higher-rate difference assigned to collection; those fields must not be independently added as full area rates.

Cash-only deposits are enforced for future bookings. Original IDs are never offered as collateral. Existing configured cash amount and approval remain intact.

The electronic signature is drawn with mouse, touch or stylus, with explicit signing consent. Normalized signature strokes are validated on the client, server and database. It is saved atomically with finalization, linked to the booking and accepted terms version, immutable, and shown on the admin rental contract export. No signed agreement upload is required. Existing identity and driving eligibility verification requirements remain in place.

Verification checklist:
- Select both services, check Same as delivery location, edit the address, and verify pickup follows it. Uncheck to enter an independent address.
- Airport for both directions totals ₱350; Lapu-Lapu for both totals ₱300; Airport + Cebu City totals ₱500. Self pickup/return stays free.
- Submit a drawn signature; retry with the same drawing; verify a changed signature is rejected and the saved contract includes the drawing, renter name and time.
- Confirm cash deposit amount, no ID custody option, document uploads and normal booking finalization.

Validation: both complete test suites, lint checks, TypeScript checks and production builds passed (480 MAIN tests; 519 ADMIN tests). Database rehearsal and committed migration assertions passed for all 25 delivery/pickup combinations, all 10 one-direction selections, free self pickup/return, cash-only settings, and signature RPC privilege boundaries. Production history was updated for both migrations. The pre-migration configuration snapshot is stored outside the repository at `/tmp/kjm-owner-before-045-046.json`.

Drawing update: UI layout verified in a temporary local preview. Both required database migrations are now installed. The synthetic database integration check in `signature-rollback-check.sql` passed actual cash booking finalization with saved drawn strokes and matching terms, idempotent retry, blank/changed drawing rejection, browser ownership, and record immutability. Every synthetic booking/document metadata/notification row was rolled back; no document bytes or provider requests were sent. A real customer acceptance or payment was not performed.

## Publication and live checks

- MAIN implementation: `0c8566b`; Vercel success: https://vercel.com/kjmmotorental-5805/main/5r2sEuQarQQzd2ekCzj1PyX2nQE5
- ADMIN implementation: `9b7b92a`; Vercel success: https://vercel.com/kjmmotorental-5805/kjmadmin/FeV1TAcsorb7ayFSNsZnkMSDAYMi
- Public site: https://kjmride.com — booking page returned 200; served booking code contains the drawing pad, Clear signature, matching-address checkbox and no-original-ID-deposit wording.
- Live quote API returned ₱350 for Airport/Airport, ₱300 for Lapu-Lapu/Lapu-Lapu, and ₱500 for Airport/Cebu City. Detailed results: `live-verification.json`.
- Admin sign-in returned 200. Its deployed commit includes drawn-signature rendering in contract exports.
- Both migration history entries and cash-only settings were reconfirmed. Existing original area rows were disabled, with historical references preserved.
