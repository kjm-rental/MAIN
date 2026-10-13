# Isolated PayMongo test environment

`.env.local` is preserved byte for byte and still represents the existing application configuration. The new `.env.paymongo-test.local` is git-ignored, mode 0600, and contains the dedicated TEST Supabase URL and matching anon/service-role JWT keys retrieved through the existing authenticated CLI. It reuses only the existing PayMongo **test** key, generates a separate reconciliation bearer secret, and leaves webhook/origin blank. Never copy the test service key into a public variable. The exact test project is pinned in both the isolated loader and shared payment endpoint configuration; live/mixed-project legacy service keys fail closed. Supabase verifies JWT signatures on RPC calls. Only the legacy service-role key format is supported by this guard.

## Commands

- `npm run check:paymongo-test`: reads only the isolated file, verifies project/key binding and performs a read-only authenticated test-database RPC. Prints missing variable names without values.
- `npm run dev:paymongo-test`: starts a separate test app at `127.0.0.1:3100`, overriding all Supabase public aliases and PayMongo server variables from the isolated file. Uses `.next-paymongo-test` to avoid the regular app's build cache. It refuses startup unless the test keys are correctly bound and `PAYMONGO_TEST_ENABLED=false`. No server was started or deployed during preparation.
- `npm run reconcile:paymongo-test`: sends authorized cursor batches to the configured HTTPS test endpoint. Overlapping local runs are skipped using a local lock; after a crashed runner, remove `.paymongo-test-reconcile.lock` only after confirming no runner is active. Review/retry states print a count for operator monitoring.

The launcher intentionally refuses activation at this preparation stage. Enabling actual Checkout requires a subsequent reviewed activation change after configuration/provider integration tests, as well as explicit database readiness changes. Current startup/check commands do not activate PayMongo or mutate database settings. Webhook/reconciliation processing can drain existing tests while creation remains disabled.

Validation completed: the actual isolated test keys successfully authenticated to the TEST `list_paymongo_test_checkouts` REST RPC; 11 focused payment/webhook tests passed, including live-database/mixed-project rejection. The checker reports only `PAYMONGO_WEBHOOK_SECRET` and `PAYMONGO_APP_ORIGIN` missing. Script syntax and scoped lint were checked; no build or live endpoint transaction was run.

## Manual HTTPS and dashboard setup

1. Set `PAYMONGO_APP_ORIGIN` in **the isolated file** to the exact HTTPS test origin with no trailing slash. You may use a separate test hostname or a tunnel. If Cloudflare Tunnel is already available, run `cloudflared tunnel --url http://127.0.0.1:3100` and use its HTTPS origin. Quick tunnel origins can change on restart: update the origin and webhook together, then restart the test app. Do not tunnel the normal production-configured app.
2. In PayMongo's **test** dashboard, register `https://<test-origin>/api/paymongo/webhook` for `checkout_session.payment.paid`. Copy that endpoint's signing secret into `PAYMONGO_WEBHOOK_SECRET` in the isolated file. No dashboard action was performed automatically. A public HTTPS route alone is not proof that webhook signature/integration testing passed.
3. Run the isolated checker, restart the isolated test app, then verify the actual webhook and protected reconciliation endpoint. All three routes use the same pinned Supabase configuration. The read-only checker verifies Supabase REST/RPC credentials, not deployed HTTP endpoints or PayMongo provider compatibility.
4. Add the isolated HTTPS origin to the TEST Supabase Auth URL/redirect configuration as required by the sign-in flow. Prepare an authorized synthetic test customer and confirmed finalized reservation. Verify TEST anonymous Auth/CAPTCHA settings independently; the loader does not change Supabase Auth or inherit production Auth configuration intentionally. Missing browser CAPTCHA configuration may still need explicit test setup.

## Scheduler preparation

After HTTPS and secrets are configured, schedule `POST https://<test-origin>/api/paymongo/reconcile` with `Authorization: Bearer <isolated reconciliation secret>` and JSON `{ "after": null }`. Follow `nextCursor` through each five-intent page; restart at null on the next sweep. Store credentials in the scheduler's secret store, never in query strings.

Alternatively, configure a local scheduler every five minutes to run `npm run reconcile:paymongo-test` from the KJM MAIN directory. The script reads the secret from the private file and handles the full cursor sweep. Keep the test app/tunnel running, prevent overlapping sweeps, and monitor its exit status and review messages. Scheduler installation and dashboard subscriptions remain manual; neither was created automatically.

## Still disabled / not yet verified

Migrations 024/025 were already verified in TEST in Stage 3; no SQL was run in this stage. The isolated checker confirms access to the TEST RPC layer. Actual Checkout creation, signed HTTPS delivery, provider expiry/recovery behavior, and end-to-end customer booking tests remain pending. Customer payment UI and ADMIN test-status display also remain pending from prior stages.

References: [Cloudflare quick tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/), [PayMongo webhook setup/signatures](https://docs.paymongo.com/docs/developer-tools-webhook-setup-management).
