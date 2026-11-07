# Owner booking changes — November 7, 2026

Implemented in MAIN and ADMIN. Migrations 045 and 046 were applied together to the shared production database on November 7, 2026 after a successful rollback rehearsal. Website publication is tracked below.

Applied `supabase/migrations/202611070045_owner_booking_updates.sql` after 044, followed by `202611070046_drawn_electronic_signatures.sql`, in one transaction before publishing either app. The migration retires old areas for new bookings and inserts the five owner-approved areas and rates. Existing booking prices, deposit custody records and terms acceptance records are preserved.

One service charge covers delivery and pickup: Lapu-Lapu ₱300; Airport ₱350; Mandaue ₱400; Cebu City ₱500; Cebu Port (Pier 1–5) ₱500. Different-area bookings use the higher rate (implementation assumption requiring owner review). A one-direction service uses the same area rate. Accounting allocates the rate to delivery first, with only any higher-rate difference assigned to collection; those fields must not be independently added as full area rates.

Cash-only deposits are enforced for future bookings. Original IDs are never offered as collateral. Existing configured cash amount and approval remain intact.

The electronic signature is drawn with mouse, touch or stylus, with explicit signing consent. Normalized signature strokes are validated on the client, server and database. It is saved atomically with finalization, linked to the booking and accepted terms version, immutable, and shown on the admin rental contract export. No signed agreement upload is required. Existing identity and driving eligibility verification requirements remain in place.

Before release, test in a migrated staging database:
- Select both services, check Same as delivery location, edit the address, and verify pickup follows it. Uncheck to enter an independent address.
- Airport for both directions totals ₱350; Lapu-Lapu for both totals ₱300; Airport + Cebu City totals ₱500. Self pickup/return stays free.
- Submit a drawn signature; retry with the same drawing; verify a changed signature is rejected and the saved contract includes the drawing, renter name and time.
- Confirm cash deposit amount, no ID custody option, document uploads and normal booking finalization.

Validation: both complete test suites, lint checks, TypeScript checks and production builds passed (480 MAIN tests; 519 ADMIN tests). Database rehearsal and committed migration assertions passed for all 25 delivery/pickup combinations, all 10 one-direction selections, free self pickup/return, cash-only settings, and signature RPC privilege boundaries. Production history was updated for both migrations. The pre-migration configuration snapshot is stored outside the repository at `/tmp/kjm-owner-before-045-046.json`.

Drawing update: UI layout verified in a temporary local preview. Both required database migrations are now installed. Full owner-controlled booking acceptance remains separate; no customer documents, payment or completed reservation were created for verification.
