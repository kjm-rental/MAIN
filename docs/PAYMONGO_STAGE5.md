# Stage 5 — private local verification, public exposure pending approval

The isolated server started successfully with `npm run dev:paymongo-test`, bound only to `127.0.0.1:3100`. Initial endpoint compilation found explicit route `runtime` exports incompatible with this Next.js version's Cache Components; those exports were removed, retaining the default Node.js runtime. All three payment routes then compiled and returned the expected 503 while required configuration is incomplete. No public tunnel, hosting deployment, dashboard subscription or scheduler was activated.

The local server was stopped after verification, and Next's automatic TypeScript config edits were reverted. Eleven focused tests, scoped lint and the scheduler plist syntax check passed. The live read-only TEST RPC check passed again; no PayMongo API creation or production database call was made.

`npm run check:paymongo-test` now prints readiness, missing variable names, webhook/reconciliation URLs when an origin exists, required events, scheduler interval, and unverified end-to-end status. It performs only a read-only RPC to the pinned dedicated TEST project. A ready configuration is explicitly different from a verified payment transaction. Current missing settings are `PAYMONGO_APP_ORIGIN` and `PAYMONGO_WEBHOOK_SECRET`. The existing generated reconciliation secret is reused and never printed.

## HTTPS webhook setup (manual, after exposure approval)

No exact public hostname exists yet, so a real HTTPS webhook URL cannot be supplied until you choose/approve hosting or a tunnel. The exact path is `/api/paymongo/webhook`.

1. Start the isolated app locally using `npm run dev:paymongo-test`. Do not use the normal production-configured `npm run dev` for payment testing.
2. After approving exposure, use a separate HTTPS test hostname or an approved tunnel forwarding to `http://127.0.0.1:3100`. Neither `cloudflared` nor `ngrok` was available during this stage; no package was installed. A stable hostname is preferable for repeatable webhook testing.
3. Set `PAYMONGO_APP_ORIGIN=https://YOUR-APPROVED-TEST-HOST` in `.env.paymongo-test.local` (no trailing slash).
4. In the PayMongo **test** dashboard, register exactly `https://YOUR-APPROVED-TEST-HOST/api/paymongo/webhook` with event **`checkout_session.payment.paid`**. Copy that endpoint's signing secret to `PAYMONGO_WEBHOOK_SECRET` in the isolated file and restart the test app. The secret is distinct from the API key and scheduler token. Do not configure live events or use a live API key.
5. Run `npm run check:paymongo-test` to obtain the exact configured URL. Verify real signed TEST event delivery and repeat delivery before activation. Bad signatures, stale timestamps, live events and unverified success redirects must not settle payments.

Existing signature tests exercise raw-byte HMAC, timestamp freshness, live-signature rejection, duplicate fields and changed bodies. Existing webhook tests exercise completed-event suppression and marking completion only after successful reconciliation. These are focused automated checks, not a real PayMongo HTTPS delivery. Dedicated TEST binding is enforced on every Checkout, webhook and reconciliation configuration path, regardless of feature flags.

## Prepared reconciliation scheduler

`docs/paymongo-test-scheduler.plist` is a passive macOS launchd template using this machine's Node executable, KJM MAIN working directory, and the existing secret-loading runner. It schedules every **300 seconds** and does not run immediately on load. It contains no credentials and is not installed. The runner serializes local sweeps and follows the five-intent cursor batches; review states must be monitored in its log.

After HTTPS/secrets and endpoint verification are complete, install manually:

```sh
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cp docs/paymongo-test-scheduler.plist "$HOME/Library/LaunchAgents/com.kjm.paymongo-test.reconciliation.plist"
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.kjm.paymongo-test.reconciliation.plist"
```

Run `npm run reconcile:paymongo-test` once manually before installing. Keep the isolated test app and HTTPS tunnel running. Monitor `~/Library/Logs/kjm-paymongo-test-scheduler.log`; failures require investigation. The template is machine-specific; regenerate paths if Node/the repository moves. Uninstall with:

```sh
launchctl bootout "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.kjm.paymongo-test.reconciliation.plist"
```

For a hosted scheduler instead: send **POST** to `https://YOUR-APPROVED-TEST-HOST/api/paymongo/reconcile`, `Content-Type: application/json`, header `Authorization: Bearer <existing PAYMONGO_RECONCILIATION_SECRET>`, body `{ "after": null }`; follow `nextCursor` until null. Restart at null every five minutes. Put the token in the scheduler secret store, never URLs or logs. Allow at least 60 seconds per batch and serialize full sweeps.

## Still blocked / disabled

Public HTTPS exposure needs user approval and a selected hostname. PayMongo test-dashboard webhook creation/signing secret and actual signed deliveries remain manual. Scheduler installation remains manual. The app/environment and database creation gates remain disabled; no real TEST charge was attempted and no production credentials/data were changed. Customer payment UI and ADMIN test-status display are still pending from earlier stages. The preparation launcher deliberately refuses enabled creation until a later controlled test/activation stage.
