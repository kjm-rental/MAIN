# Migration 020 proposal — not applied

Target production project: `slevojynuumrvgiznmxk`. Test project: `uuxjymzrtncrnnkvdpjy`.

The prepared SQL is [202610110020_cash_deposits_and_rental_operations.sql](../../supabase/migrations/202610110020_cash_deposits_and_rental_operations.sql).

## Database changes

- Creates one administrator-controlled security-deposit policy row. Cash and physical-ID options default to disabled; amount defaults to NULL, and approved document types default to an empty list.
- Adds read-only deposit snapshots, immutable deposit events and immutable handover/return inspections. Forces RLS. Direct client mutations are revoked; RPCs require an active administrator or existing restricted customer booking authorization, as applicable. Ledger actors and synthetic provenance come from the authenticated user and booking, never form input.
- Marks existing bookings as workflow version 0; new requests use version 9. Existing ongoing bookings retain their established workflow; requirements are never invented or backfilled. New requests require a server-approved deposit snapshot at transaction completion.
- Adds v3 quote/submission RPCs around the existing v2 booking engine. Existing prices, quantity availability, holds, readiness, verification and expiration logic remain in that engine. Policy-version validation rejects stale quotes. Immutable request fingerprints and transaction/booking locks protect retries and accounting.
- Revokes direct customer execution of the old submission RPCs to prevent bypassing deposit selection. They remain internal implementation dependencies. This requires coordinated MAIN/ADMIN code release after schema approval; old customer submission clients will not work after migration 020.
- Enforces cash-only new rental receipts. Historical receipts and authorized corrections remain intact. Deposit cash is separate from rental receipts and never counted as rental revenue.
- Guards new-request confirmation, paid handover and inspected completion. Requires private verification documents and an available assigned motorcycle. A completed rental with outstanding cash or ID custody must retain an explicit unresolved case; resolution cannot erase outstanding liability. No deductions are implemented.
- Preserves actual handover/return inspection timestamps. Audit events keep true timestamptz timestamps; form input is interpreted in Asia/Manila.

## Security review

All added security-definer functions have an empty search path, explicit execute grants, and in-function ownership/active-admin checks. Private trigger helpers have no client execute grants. Sensitive deposit-event notes and inspections are admin-only; the owner summary exposes balances, selected arrangement and approved policy instructions, not private event notes. No collateral ID number or image field is introduced. Existing private verification Storage is preserved.

The handover guard uses the authoritative `quoted_total_php * 100`, because generated `total_centavos` is unavailable inside a PostgreSQL BEFORE trigger. Regression testing proved unpaid handover is rejected.

## Approval and rollout

No migration has been committed to either Supabase project. Migration 020 and synthetic workflow fixtures were executed inside a disposable transaction and rolled back. Production data has not been modified. Public booking and anonymous Auth have not been enabled.

Approval requested first: apply migration 020 to the disposable project, then run concurrent v3 submission, deposit collection/return and handover acceptance tests on its committed schema. Applying 020 to production requires separate approval and an agreed coordinated release. Do not deploy or enable public bookings automatically.

After schema approval, management must approve the actual cash amount and collection/return/dispute instructions before enabling cash deposits. Physical ID must remain disabled without legal-review evidence, exact lawful types and explicit management attestation. Partial cash returns default to disabled. Pending expiration of 24 hours and a 30-minute hold are provisional existing policies, not changed by migration 020.
