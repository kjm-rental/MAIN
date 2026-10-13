# Reservation and verification upgrade — October 12, 2026

Implemented in the existing MAIN and ADMIN applications. No deployment, production migration, price change, public-booking activation, payment gateway activation, or real notification delivery occurred.

## MAIN changes

- Model-specific date/time availability loads automatically and refreshes while the form is open. Fully unavailable days and individual slots are disabled; partially available days remain selectable. Applying a time rechecks the backend. Before a return is chosen, an explicit preview-duration field determines the requested period; once selected, the exact pickup/return period is used. This field does not change pricing.
- Eligible domestic bookings finalize only after required information, real private uploads, and current terms acceptance pass server validation. The receipt distinguishes confirmed inventory from pending document verification. International reservations retain manual booking approval.
- Owners can replace explicitly requested documents securely. Original evidence and review history remain available to staff. Customers receive correction instructions without private approval notes.
- An owned pending draft can be abandoned to release its own hold when changing dates; confirmed reservations retain controlled staff cancellation.

Changed/new implementation files: `src/components/website/booking-checkout.tsx`, `src/components/website/verification-resubmission.tsx`, `src/components/ui/rental-date-time-picker.tsx`, `src/hooks/use-model-availability.ts`, `src/lib/availability-periods.ts`, `src/lib/availability-periods.test.ts`, `src/app/(website)/booking/status/[id]/page.tsx`, `src/types/database.ts`, `src/lib/content/rental-journey.ts`, `src/lib/content/rental-journey.test.ts`, `src/components/website/faq-content.ts`, and `src/app/(website)/how-it-works/page.tsx`. The official terms archive and agreement wording remain unchanged. Test harnesses/results/screenshots live in this directory.

## ADMIN changes

- Verification records open their customer/booking detail view. Actual private images render inline with labels, multiple previews, loading/retry states, enlargement and zoom. PDFs use an inline viewer.
- Shared review controls preserve manual approval, rejection, correction requests and audit history. Rejection/correction requires a reason. Cancellation remains a separate controlled action.
- A real month grid and week/day timelines show actual reservations, maintenance, statuses, overlapping lanes and pickup/return movements. Exact calendar navigation, Today, Manila boundaries, loading/error states and mobile scrolling are included.
- Existing notification templates distinguish reservation confirmation from verification; provider and delivery controls remain unchanged.

Changed/new implementation files: `src/components/private-document-viewer.tsx`, `src/components/verification-review.tsx`, `src/components/reservation-calendar.tsx`, `src/app/dashboard/verifications/page.tsx`, `src/app/dashboard/verifications/[id]/page.tsx`, `src/app/dashboard/bookings/[id]/page.tsx`, `src/app/dashboard/documents/[id]/route.ts`, src/app/dashboard/documents/document-errors.test.ts, `src/app/dashboard/calendar/page.tsx`, `loading.tsx`, `error.tsx`, `src/lib/reservation-calendar.ts`, its tests, `src/lib/calendar-period.ts`, `src/app/dashboard/query-errors.test.ts`, `src/lib/notifications/types.ts`, and `src/lib/notifications/templates.ts`.

## Database migration and security

`supabase/migrations/202610120023_reservation_confirmation_and_availability.sql` is necessary because the previous database guard required manual document approval even for reservation confirmation, and public clients lacked a bounded whole-period availability interface.

It reuses existing inventory, submission idempotency, unit locking, storage and verification records. New immutable terms-acceptance and automatic-confirmation audit records have forced RLS. Existing records are preserved; no historical acceptances are fabricated. The official terms source hash is recorded without changing its content.

Availability counts physical eligible units for the entire half-open rental interval. Existing pending/confirmed/active reservations, live holds, maintenance and unavailable/archived units block inventory; cancellation and expired holds do not. Customers receive counts, not other customers' data or unit identifiers. Operating hours, midnight and duration validation reuse existing server quote rules.

Finalization locks and revalidates the existing booking, model, unit and hold, checks private uploaded objects and required metadata, records accepted terms, and atomically confirms eligible domestic reservations. Repeated finalization is idempotent. International booking approval stays manual. The trusted confirmation exception applies only to the confirmation stage: active pickup still requires approved identity/licence/entitlement, documents, payment/deposit and existing inspection gates.

Document delivery authenticates administrators before issuing five-minute signed access, audits access and uses private no-store/no-referrer responses. The bucket stays private. Confirmed customers can upload only explicitly requested replacements through guarded functions; ordinary direct metadata insertion remains restricted.

Migration 023 was applied and repeatedly verified **only on disposable project `uuxjymzrtncrnnkvdpjy`**. Its final source exactly matched the disposable migration history. It has **not** been applied to production. Production use of the new RPC-backed features therefore requires a separately reviewed migration application; do not enable public booking as part of that step.

## Validation

- MAIN: 12 test files, **84 tests passed**; TypeScript, ESLint and production build passed.
- ADMIN: 19 test files, **232 tests passed**; TypeScript, ESLint and production build passed.
- Disposable integration: **42/42 assertions passed** using real Auth, private Storage and separate PostgreSQL backends for the concurrency race.
- Final database validation: **11/11 passed**, including source parity, required uploaded documents before staff approval, invalid customer details, forced RLS, private bucket and absence of overlapping confirmed unit reservations.
- Live availability picker: **7/7 passed**, including unavailable/partial dates, disabled slots, model changes and inventory changing after selection.
- Browser results: all recorded scenarios passed; month-render assertion appears twice because resumed runs merged earlier successful mutating checks. Genuine authenticated synthetic sessions were used. Screenshots cover desktop/mobile verification, month/week/day calendars, availability and confirmed receipt.
- Restricted correction-instruction privacy test passed.

### Requested scenario coverage

| # | Scenario | Evidence |
|---|---|---|
| 1 | One unit | Integration count |
| 2 | Multiple same-model units | Integration count and picker model change |
| 3 | Fully booked | Integration and live disabled date |
| 4 | Partial availability | Whole-period integration and live selectable day |
| 5 | Unavailable pickup time | Live disabled 08:30 / enabled 09:00 |
| 6 | Overlapping periods | Integration whole-period checks and lane unit tests |
| 7 | Midnight | Integration exact boundary and time-slot tests |
| 8 | Multiple days | Integration and calendar range tests |
| 9 | Cancelled availability | Integration controlled cancellation |
| 10 | Maintenance | Integration and live stale-selection rejection |
| 11 | Expired holds | Integration |
| 12 | Last-unit simultaneous requests | Two actual PostgreSQL backends; exactly one success |
| 13 | Inventory changes with open form | Live picker recheck and transactional finalization rollback |
| 14 | Automatic confirmation | Integration and real browser checkout/uploads |
| 15 | Verification pending | Integration and receipt browser assertion |
| 16 | Missing documents | Integration and final database validation |
| 17 | Invalid details | Integration, invalid phone/country validation |
| 18 | Failed inventory | Integration rollback |
| 19 | Cancellation releases unit | Integration and admin browser cancellation |
| 20 | International restrictions | Integration manual reservation and pending verification |
| 21 | Open verification record | Authenticated browser detail route |
| 22 | Inline images | Browser actual private images |
| 23 | Multiple images | Browser |
| 24 | Enlargement | Browser dialog and zoom |
| 25 | Approve | Browser audited action and database reviewer/time checks |
| 26 | Reject | Browser and reason validation |
| 27 | Request resubmission | Actual review RPC, customer browser correction/upload; review control shares existing ActionForm |
| 28 | Unauthorized access | Browser sign-in redirect, route tests and storage integration |
| 29 | Private URLs | Public URL denied and short-lived admin signing integration |
| 30 | Decision audit | Integration reviewer/time and audit/history |
| 31 | Month | Browser actual reservations and screenshot |
| 32 | Week | Browser actual reservations and screenshot |
| 33 | Day | Browser actual reservations and screenshot |
| 34 | Multi-day calendar | Range/intersection unit tests and populated calendar views |
| 35 | Booking detail link | Existing booking detail hrefs retained in calendar; dedicated click-through browser assertion not executed |
| 36 | Navigation | Browser exact July heading and calendar period tests |
| 37 | Manila timezone | Explicit +08 period tests, midnight integration and timeline tests |
| 38 | Mobile | Browser overflow assertions and screenshots |

## Limits and cleanup

The disposable browser harness bypassed the administrator PIN login by using a genuine authenticated test session; PIN login itself was not changed or retested. Browser correction requests were prepared using the real audited RPC; approval, rejection and cancellation were exercised through UI actions. No real documents or customer contact information were used. Existing MAIN motion CSS produced pre-existing `:global` production-build warnings; the build completed successfully.

Disposable settings were restored, public booking remains false, synthetic tester access was revoked, the synthetic administrator was deactivated and synthetic models were unpublished. Ten synthetic reservations were retained with history and controlled cancellation; documents and audit evidence were preserved. See `cleanup-results.json`. Temporary test servers were stopped; normal localhost MAIN/ADMIN servers were left running. Notification channel controls remained off throughout testing.
