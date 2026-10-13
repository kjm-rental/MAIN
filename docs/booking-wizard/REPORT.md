# Four-step booking wizard

Implemented only in KJM MAIN. The existing `/book/[slug]` entry points now show Motorcycle → Dates & Times → Your Details → Review, followed by the backend-derived receipt. Motorcycle-card links preselect the clicked model; the new `/book` entry is used by header and hero booking buttons.

The wizard uses existing catalog images, private uploads, operating hours, Manila time, pricing APIs, terms acceptance, submission idempotency, inventory holds and automatic-confirmation functions. Extras remain optional in Dates & Times; existing deposit choices are included in Your Details and summarized in Review. No business policies, prices, database schema, security controls or ADMIN files changed.

Calendars render inline for the booking page, while existing non-wizard picker callers retain their modal behavior. Return selection follows pickup. Whole-period availability checks are reused, with the existing one-day initial preview; Continue rechecks actual dates through the same live availability RPC. Dates with failed availability remain unselectable. Date changes clear the stale quote. The price preview is labelled estimated until the existing server pricing APIs validate it.

Documents remain in component state when moving backward. Local blob image previews are revoked on replacement/unmount and upload only through the existing secure submission flow. Confirmation wording uses the final backend status: eligible domestic confirmations retain pending manual document review, and international requests remain pending manual approval. The existing protected status page remains linked from the receipt.

## Validation

- 35 targeted tests passed across booking, availability-periods, availability-errors, rental-time-slots and security-deposits.
- TypeScript and focused ESLint passed.
- Production build passed; existing motion CSS `:global` warnings remain.
- Seven frontend browser assertions passed with synthetic RPC mocks: one step visible, inline calendars, mobile dates without horizontal scrolling, review/Confirm Booking, Back preserving details, two local document previews surviving Back, mobile details without horizontal scrolling. Desktop/mobile screenshots and `ui-results.json` are adjacent. These tests did not submit reservations or mutate Supabase; they do not constitute a new live inventory/concurrency test.

## Existing rollout blockers

The connected production Supabase project returned PGRST202 for `get_model_slot_availability` during the preceding focused availability investigation. Migration 023 is still required and was not applied here. No fallback bypasses availability. Existing configuration, deposit policy, tester authorization and public-booking gates remain; unauthorized sessions continue to see the existing launch-gate notice. No deployment, commit, push, public-booking activation or production database mutation occurred.

## Files

- `src/components/website/booking-checkout.tsx`
- `src/components/website/booking-wizard.css`
- `src/components/ui/rental-date-time-picker.tsx`
- `src/app/(website)/book/[slug]/page.tsx`
- `src/app/(website)/book/page.tsx`
- `src/components/layout/site-header.tsx`
- `src/components/website/hero.tsx`
