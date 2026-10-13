# KJM readiness verification

Tests target disposable Supabase `uuxjymzrtncrnnkvdpjy`. Production `slevojynuumrvgiznmxk` receives read-only inspection and evidence metadata updates only. No deployments, public activation, anonymous Auth, production fixtures, customer changes or price changes are authorized or performed.

## Reproduce

From the workspace root:

```sh
node 'KJM MAIN/docs/readiness-20261011/run.cjs'
node 'KJM MAIN/docs/readiness-20261011/lint.cjs'
```

The guarded connection helper in `docs/phase10-migration022/connection.cjs` requires the disposable Supabase link metadata and private database password under `/tmp`. It rejects the production reference. The Supabase CLI must already be authenticated and able to retrieve disposable API keys. PostgreSQL driver and Playwright dependencies currently live in `/tmp/kjm-phase6-node/node_modules/pg` and `/tmp/kjm-phase7-browser.xAGrbn/node_modules/playwright`; install those dependencies and adjust those paths on another machine. Credentials are used in memory and never written to evidence. Run against an idle disposable project: the suite temporarily configures synthetic approved policies and restores its original settings in `finally`.

The runner creates password-authenticated synthetic users, short-lived restricted tester authorization, a synthetic model/unit, synthetic bookings and private synthetic document uploads. It tests concurrent operations in distinct PostgreSQL backends. It cancels remaining synthetic bookings, revokes tester authorizations, deactivates its synthetic administrator, restores settings and checks public booking, physical-ID custody and notification channels remain disabled. Synthetic fixtures and documents are retained in the disposable project for inspection.

For each application, run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`. `application-validation.json` records the observed outcomes. ADMIN was revalidated after adding database-source/load-time information to the readiness panel. MAIN's successful production build emits existing CSS `:global` transform warnings.

## Evidence

- `results.json`: authoritative completed integration run, server timestamp, assertions, backend IDs, concurrent commit/rollback outcomes and migration hashes.
- `runtime-results.json`: actual browser submission, double-click count, private uploads and production-request guard.
- `screenshots/`: desktop/mobile booking receipt.
- `lint-results.json`: disposable public/private schema lint.
- `production-before.json`: actual October 9 readiness records and aggregate fingerprints of untouched production tables.
- `function-parity.json`: all 55 application functions match exactly; production additionally has a platform `rls_auto_enable` DDL helper.
- `disposable-readiness.json` and `production-readiness.json`: committed evidence rows, source project and disabled safety flags.
- `production-postflight.json`: independent post-commit readback, unchanged production fingerprints and RLS enabled on all 31 application tables.
- `FINAL_REPORT.md`: checks, validation, fixes and remaining launch blockers.
- Initial failure evidence is preserved separately. Failed runs are never published as passing evidence.

`record.cjs` refuses to record results unless the full suite and lint pass, all required keys completed and application-function parity is proven. It updates existing readiness rows only, with the actual test timestamp and SHA-256 evidence digest. It checks production table fingerprints before any metadata update and refuses if records/settings changed since inspection. It requires privately prepared production connection tooling in `/tmp`; it never installs migrations or creates production fixtures. Automated production evidence uses `checked_by = null` rather than impersonating an administrator.

## Scope and launch

Runtime testing exercises local application code with real disposable hosted Supabase Auth, database and Storage. It does not claim deployed-host runtime testing or genuine identity/document authenticity; synthetic review validates authorization and approval gates. The production dashboard previously showed October 9 because those were the stored check timestamps, not hardcoded UI dates. The authenticated settings page reads live database rows; its route is dynamic. The local dashboard now also identifies the connected project and the load timestamp separately from check timestamps.

Read-only production inspection found all required policy fields populated, matching operating-hour/pricing modes, cash deposits enabled and physical-ID custody disabled. Booking-policy approval is not recorded. Explicit business approval and deployment-host validation remain launch requirements. The disposable suite uses a 60-minute pending duration; production retains its existing 1440-minute duration. Expiration tests exercise timestamp eligibility directly, without waiting for either duration. Public booking must remain disabled until these are resolved and an explicit later activation is authorized.
