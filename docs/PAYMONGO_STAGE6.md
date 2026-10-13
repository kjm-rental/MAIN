# Stage 6 preparation — tunnel not started

No supported tunnel CLI was found (`cloudflared`, `ngrok`, `tailscale`, `localtunnel`, `lt`, or the usual Homebrew cloudflared/ngrok paths). No package was installed. The read-only isolated checker authenticated to the dedicated Supabase TEST RPC and confirmed creation remains disabled. `PAYMONGO_APP_ORIGIN` and `PAYMONGO_WEBHOOK_SECRET` are still missing. Local test startup and all three route compilations were already verified in Stage 5; the focused signature/duplicate-event tests passed there. No new public delivery or actual PayMongo transaction has been verified.

## Hostname / approval blocker

The user requires approval of the final hostname before starting a tunnel. A Cloudflare Quick Tunnel allocates its random hostname when started, so it cannot meet that ordering. Use a preassigned/reserved ngrok HTTPS hostname or a named Cloudflare tunnel on a domain you control. No real hostname is currently configured or reserved by this workspace; do not treat an example hostname as provisioned.

Manual action: install/authenticate a suitable tunnel client and supply its reserved HTTPS hostname (no tokens in chat). Then approve that specific hostname and exposure. Preparing a tunnel does not authorize starting it. No app origin or production configuration was changed in this stage.

Before exposing anything, configure the tunnel's ingress/traffic policy to allow only POST `/api/paymongo/webhook` and POST `/api/paymongo/reconcile`, with a default deny/404 for all other paths. Do not forward the whole app publicly: booking pages, storage/private-document routes, development assets and other APIs must stay inaccessible. Verify the provider's route policy on the approved hostname before webhook tests. Avoid recording payloads or authorization headers in tunnel request inspection/logs. Do not put interactive login in front of the PayMongo webhook; its raw-body signature is the authentication mechanism.

## After exact-host approval and route isolation

1. Run `npm run dev:paymongo-test` (loopback only, port 3100, dedicated test file). Run `npm run check:paymongo-test`; stop if test binding fails. Retain `PAYMONGO_TEST_ENABLED=false` and disabled database readiness settings.
2. Put the approved exact HTTPS origin in `.env.paymongo-test.local` as `PAYMONGO_APP_ORIGIN`, without a trailing slash. Restart the isolated app.
3. Start only the approved route-restricted tunnel to `http://127.0.0.1:3100`. For ngrok use its reserved `--url` and `--inspect=false` together with the previously verified traffic policy. No tunnel-start command was executed or approved automatically.
4. Exact webhook URL is the configured origin followed by `/api/paymongo/webhook`. The checker prints it once configured. In the PayMongo TEST dashboard, register that URL for `checkout_session.payment.paid` and copy the endpoint signing secret into `PAYMONGO_WEBHOOK_SECRET` in the private isolated file. Never paste secrets into chat or shell arguments. Restart the isolated app and verify genuine signed test deliveries and duplicate delivery behavior.
5. Run `npm run reconcile:paymongo-test` once after the HTTPS endpoint and secrets are ready. It reads the existing reconciliation secret privately, sends bearer-authenticated POSTs, follows all cursor pages and reports review/retry items. Until then the command correctly refuses incomplete configuration; no scheduler/network call was attempted here.
6. For every-five-minute execution, manually install the prepared `docs/paymongo-test-scheduler.plist` following `docs/PAYMONGO_STAGE5.md`, or configure a scheduler to POST `/api/paymongo/reconcile` with the bearer secret and `{ "after": null }`, following `nextCursor` until null. Do not activate the scheduler before manual command verification.

The exact public URL remains unavailable until a reserved hostname is supplied and approved. Real signature delivery, provider recovery/expiry, scheduler execution and payment transactions remain pending. Cash code/data and production credentials remain unchanged; no production database was contacted.

References: [Cloudflare random-host allocation](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/), [ngrok reserved URL and inspection options](https://ngrok.com/docs/gateway/agent/cli), [PayMongo webhook configuration/signatures](https://docs.paymongo.com/docs/developer-tools-webhook-setup-management).
