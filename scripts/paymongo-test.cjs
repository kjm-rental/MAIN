/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS environment launcher; no transpiler required. */
// Reads ONLY the isolated test file. Never replaces .env.local or logs credentials.
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { load, root, testURL } = require("./paymongo-test-env.cjs");
async function main() {
  const env = load();
  const command = process.argv[2] || "check";
  if (command === "dev") {
    const child = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", "3000"], {
      cwd: root, stdio: "inherit", env: { ...process.env, ...env, KJM_PAYMONGO_TEST: "true" },
    });
    child.on("exit", code => { process.exitCode = code ?? 1; });
    child.on("error", () => { console.error("Isolated test app failed to start"); process.exitCode = 1; });
    process.on("SIGINT", () => child.kill("SIGINT"));
    process.on("SIGTERM", () => child.kill("SIGTERM"));
    return;
  }
  const missing = ["PAYMONGO_WEBHOOK_SECRET", "PAYMONGO_APP_ORIGIN", "PAYMONGO_RECONCILIATION_SECRET"].filter(k => !env[k]);
  if (env.PAYMONGO_WEBHOOK_SECRET && env.PAYMONGO_WEBHOOK_SECRET.length < 16) throw new Error("Webhook secret is too short");
  if (!env.PAYMONGO_RECONCILIATION_SECRET || env.PAYMONGO_RECONCILIATION_SECRET.length < 32) throw new Error("Reconciliation secret is missing/too short");
  if (command === "check") {
    const result = await fetch(`${testURL}/rest/v1/rpc/list_paymongo_test_checkouts`, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_after: null }),
    });
    if (!result.ok || !Array.isArray(await result.json())) throw new Error("Test database RPC authentication failed");
    const origin = env.PAYMONGO_APP_ORIGIN || null;
    let schedulerRunning = false;
    try { process.kill(Number(fs.readFileSync(path.join(root, ".paymongo-tools/scheduler.pid"), "utf8")), 0); schedulerRunning = true; } catch { /* No local scheduler. */ }
    console.log(JSON.stringify({ dedicatedTest: true, testServiceRPC: "verified", checkoutEnabled: env.PAYMONGO_TEST_ENABLED === "true", missing,
      configurationReady: missing.length === 0,
      endToEndVerified: false,
      publicExposureApproved: env.PAYMONGO_TUNNEL_APPROVED === "true",
      webhookURL: origin ? `${origin}/api/paymongo/webhook` : null,
      webhookEvents: ["checkout_session.payment.paid"],
      reconciliationURL: origin ? `${origin}/api/paymongo/reconcile` : null,
      scheduler: { intervalSeconds: 300, localRunning: schedulerRunning, command: "npm run schedule:paymongo-test" },
      nextStep: missing.length ? "Set the missing variables in .env.paymongo-test.local" : "Complete a hosted TEST simulator payment and verify signed settlement; LIVE stays disabled",
    }, null, 2));
    return;
  }
  if (command !== "reconcile") throw new Error("Use check, dev or reconcile");
  if (missing.length) throw new Error("Finish isolated test webhook/origin configuration first");
  const lock = path.join(root, ".paymongo-test-reconcile.lock");
  try { fs.mkdirSync(lock); } catch (e) { if (e.code === "EEXIST") return; throw e; }
  try {
    let after = null;
    do {
      const r = await fetch(`${env.PAYMONGO_APP_ORIGIN}/api/paymongo/reconcile`, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(60000),
        headers: { Authorization: `Bearer ${env.PAYMONGO_RECONCILIATION_SECRET}`, "Content-Type": "application/json" },
        body: JSON.stringify({ after }),
      });
      if (!r.ok) throw new Error("Test reconciliation failed; investigate before retrying");
      const data = await r.json();
      if (!Array.isArray(data.results) || !(data.nextCursor === null || /^[0-9a-f-]{36}$/i.test(data.nextCursor)))
        throw new Error("Invalid reconciliation response");
      const problems = data.results.filter(x => ["retry_required", "creation_unresolved", "review_required"].includes(x.status));
      if (problems.length) {
        console.error(`Test payment review required: ${problems.length} item(s)`);
        process.exitCode = 1;
      }
      after = data.nextCursor;
    } while (after);
  } finally { fs.rmdirSync(lock); }
}
main().catch(() => { console.error("PayMongo test setup/check failed. Check isolated configuration and test connectivity; no credentials logged."); process.exitCode = 1; });
