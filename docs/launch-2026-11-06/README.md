# Launch verification — November 6, 2026

Customer site: https://kjmride.com
Admin: https://kjmadmin.vercel.app

## Completed

- Restored Admin production Supabase configuration and preserved the existing PIN pepper. The owner signed in successfully; the configured Auth account has active admin membership.
- Published MAIN revision `93b9ece`, including the reviewed color-aware booking, accessory, delivery, checkout and presentation changes. Vercel reports Ready and the public checkout serves the updated controls.
- Published ADMIN revision `7192fa5` and redeployed its approved worker configuration and QRPh readiness display flag.
- Upgraded both applications to Next.js / eslint-config-next 16.4.5 and patched Zod. MAIN's production dependency audit reports zero vulnerabilities. Development tooling still has moderate advisories and is not included in that claim.
- Fixed the Admin offline-payment boundary to reject non-cash rental receipts before database access; gateway payments retain their provider-verification path.
- Fixed direct Node template loading in the email diagnostic. Updated stale checkout/inventory/upload test expectations to current behavior.
- MAIN: 442 tests passed. ADMIN: 479 tests passed. Both lint and production builds passed. The standalone production scheduler has four passing tests.
- Ten public pages/API endpoints returned HTTP 200 without the application's server-error screen. QRPh methods report enabled.
- All literal RPC names referenced by production source exist in the shared REST schema. The required color, manual-adjustment and accessory compatibility fields exist. The private verification bucket remains private.
- Anonymous read-only color and accessory availability checks succeeded for published models using valid operating times. Browser review exercised pickup, return, color selection, price display and progression to customer details without creating a reservation.
- Admin dashboard, manual booking form, deposit view and notification history rendered during authenticated review. This is page/readiness evidence, not proof of every mutation path.

## Notification activation

The owner authorized customer emails and owner Telegram delivery for **new events only**.

- Set the existing database `delivery_start_at` boundary to **2026-11-06 11:05:16 Asia/Manila**. Old pending rows remain retained behind the boundary. No pending-history deletion or blanket retry was performed.
- Configured Admin's server-only Supabase service key, bot credentials, worker secret and app URLs in Vercel Production.
- Matched MAIN's existing dispatch endpoint secret to the separate encrypted GitHub Actions secret. The independent owner-worker secret is also stored in the private MAIN repository.
- Added a bounded, non-overlapping five-minute GitHub Actions scheduler, activated by `KJM_NOTIFICATIONS_SCHEDULER_ENABLED=true`.
- Both deployed workers returned successful authenticated responses.
- First manually dispatched remote scheduler run succeeded: https://github.com/kjm-rental/MAIN/actions/runs/42155488280

GitHub scheduled triggers are best effort. A successful manual dispatch does not by itself prove an automatic scheduled trigger or customer inbox delivery.

## Final owner acceptance

Complete one owner-controlled booking through the public site, verify its matching Admin record, and check the customer email/owner alert. The owner must complete any real QRPh payment. Review the resulting payment/deposit/verification state before any real handover.

This launch verification did not create a new customer booking, charge a payment, approve documents, hand over a motorcycle, or record a deposit/return. Existing historical staging/payment evidence is separate from this current acceptance check.
