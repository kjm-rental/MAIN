# KJM readiness final report

Completed integration run: `e1e4bc35-33e0-4521-90e3-3ee9c527b899`.
Actual database test timestamp: `2026-10-11T16:05:28.628Z` — October 12, 2026, 00:05:28 Asia/Manila.

All eight requested checks passed; none remain pending. Database lint and document security also passed. Both disposable and production readiness tables now contain 10 Passed checks with recorded evidence; no status is hardcoded in the dashboard.

| Check | Status | Reproducible evidence |
|---|---|---|
| competing hold race | PASSED | Two customers claim last unit distinct simultaneous backends; Exactly one winner and one inventory rejection; No overlapping live holds for the unit |
| expiration confirmation race | PASSED | Expired confirmation vs worker distinct simultaneous backends; Expired booking cannot confirm and releases hold; Expired hold released; Fresh confirmation vs worker distinct simultaneous backends; Fresh booking confirms and cannot be expired |
| idempotent retry | PASSED | Identical concurrent submissions distinct simultaneous backends; Both return the same booking; Exactly one booking, hold and immutable snapshot; Same key cannot change dates |
| operating hours | PASSED | Pickup 07:59 rejected; Pickup 08:00 Manila boundary; Pickup 23:59 Manila boundary; Pickup 00:00 Manila boundary; Pickup 00:01 rejected; Return 07:59 rejected; Return 08:00 Manila boundary; Return 23:59 Manila boundary; Return 00:00 Manila boundary; Return 00:01 rejected |
| pricing | PASSED | 1 seconds server-priced 24h boundary; 86399 seconds server-priced 24h boundary; 86400 seconds server-priced 24h boundary; 86401 seconds server-priced 24h boundary; 172800 seconds server-priced 24h boundary; 172801 seconds server-priced 24h boundary; Submitted amount equals server quote |
| reschedule conflict | PASSED | Confirmed booking overlap rejected; Live pending hold overlap rejected; Maintenance overlap rejected; Failed attempts preserve original dates and pricing; Adjacent non-overlapping boundary accepted |
| submission runtime | PASSED | Unauthorized authenticated customer blocked; Missing consent blocked; Anonymous HTTP submission denied; Anonymous Auth remains disabled; Real restricted sign-in through disposable Auth and tester authorization; Actual browser double click sends exactly one submission; No production network requests; Browser submission persists one synthetic server-priced booking; Browser uploads and registers two real private synthetic documents; Actual HTTP retry returns original booking; p_privacy_consent false blocks full-payload HTTP submission; p_declaration false blocks full-payload HTTP submission; Anonymous full-payload HTTP submission denied by authorization; Client direct booking insert denied by permissions |
| verification gate | PASSED | No documents/review cannot be confirmed; Uploaded but unreviewed documents cannot confirm; Rejected licence review blocks approval; Expired licence blocks approval; Reviewed identity/license/entitlement and stored documents allow confirmation; Customer cannot approve own verification; Cross-customer documents hidden by RLS; Fully reviewed booking without drivers_license_front cannot confirm; Fully reviewed booking without government_id cannot confirm |

## Validation

Integration: 64 assertions passed; zero failed. Concurrent PostgreSQL backend IDs and committed/rolled-back outcomes are in results.json.

ADMIN: TypeScript, ESLint, 225 automated tests and production build passed. MAIN: TypeScript, ESLint, 56 automated tests and production build passed. Public/private database lint passed. MAIN retains 20 existing CSS transform warnings in its successful build.

## Findings and fixes

No booking-engine defect was found. Corrected the test runner’s expected consent/declaration error wording, upload-field selector, and direct-insert fixture state so the test reaches RLS (SQLSTATE 42501). Added full-payload anonymous, privacy-consent and declaration denials, plus mandatory-document denial on fully reviewed synthetic bookings. Preserved failed-run evidence separately; only the completely passing run was recorded.

The production dashboard was showing actual October 9 database records. Updated only readiness metadata after proving all 55 application function definitions match the disposable environment (production additionally has a platform RLS auto-enable helper). The dashboard still reads real database statuses and checked_at fields. Local ADMIN code now displays project source and data-load time separately; this UI addition has not been deployed.

## Remaining launch blockers

Required production policy fields are populated, but policies_approved_at is absent: explicit business booking-policy approval remains required. Production cash deposits are enabled; physical-ID custody stays disabled. Public booking remains disabled. Deployed-host submission/runtime testing is not claimed; the passing browser test used local code with real disposable Supabase Auth, database and Storage. Resolve these separate release requirements before any later, explicitly authorized activation.

No deployment occurred. No real customer data was used. No production bookings, customers, motorcycle prices, business settings or notification settings were changed. Aggregate fingerprints verify preservation. RLS and authentication remain enforced; anonymous Auth stays disabled. Synthetic fixtures remain only in the disposable project, with open bookings cancelled and temporary tester/admin access revoked.

Evidence: results.json, runtime-results.json, lint-results.json, application-validation.json, function-parity.json, production-readiness.json, production-postflight.json, production-auth.json and screenshots/. See README.md for reproduction prerequisites.
