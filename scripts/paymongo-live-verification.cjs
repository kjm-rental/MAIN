/* eslint-disable @typescript-eslint/no-require-imports -- Operator-only, one-session live verification utility. */
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
require("@next/env").loadEnvConfig(path.resolve(__dirname, ".."), true);
const folder = path.resolve(__dirname, "../.paymongo-tools");
const stateFile = path.join(folder, "live-verification-php10.json");
const name = "KJM live QRPh verification - PHP10 - not a rental";
const secret = process.env.PAYMONGO_LIVE_SECRET_KEY || process.env.PAYMONGO_SECRET_KEY;
async function provider(suffix, body) {
  const response = await fetch(`https://api.paymongo.com/v1/checkout_sessions${suffix}`, {
    method: body ? "POST" : "GET", redirect: "error", signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Basic ${Buffer.from(secret + ":").toString("base64")}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify({ data: { attributes: body } }) } : {}),
  });
  if (!response.ok) throw Error(`Provider HTTP ${response.status}; do not retry session creation`);
  return (await response.json()).data;
}
function validate(session, reference) {
  const a = session?.attributes;
  if (!/^cs_[A-Za-z0-9]+$/.test(session?.id || "") || session.type !== "checkout_session" ||
      a?.livemode !== true || a.reference_number !== reference || a.line_items?.length !== 1 ||
      a.line_items[0].name !== name || a.line_items[0].amount !== 1000 ||
      a.line_items[0].currency !== "PHP" || a.line_items[0].quantity !== 1 ||
      (a.payment_intent?.attributes?.amount !== undefined && a.payment_intent.attributes.amount !== 1000))
    throw Error("Provider session does not match the approved PHP10 verification");
  const u = new URL(a.checkout_url);
  if (u.protocol !== "https:" || u.hostname !== "checkout.paymongo.com" || u.port || u.username || u.password)
    throw Error("Unexpected checkout destination");
  return a;
}
async function main() {
  if (process.env.PAYMONGO_MODE?.trim().toLowerCase() !== "live" || !secret?.startsWith("sk_live_")) throw Error("Explicit live credentials required");
  const command = process.argv[2];
  if (!["create", "check"].includes(command)) throw Error("Use create or check");
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  let saved;
  if (fs.existsSync(stateFile)) saved = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  if (!saved) {
    if (command !== "create") throw Error("No verification session exists");
    saved = { reference: `KJM-LIVE-VERIFY-${randomUUID()}`, state: "creation_claimed", amountCentavos: 1000 };
    // Persist the claim before the single irreversible provider POST. Never auto-retry.
    fs.writeFileSync(stateFile, JSON.stringify(saved), { flag: "wx", mode: 0o600 });
    const session = await provider("", {
      description: "Owner verification payment only. PHP10 real money. No motorcycle booking or rental credit.",
      line_items: [{ name, amount: 1000, currency: "PHP", quantity: 1 }],
      payment_method_types: ["qrph"], reference_number: saved.reference,
      success_url: "https://kjmride.com/?payment_verification=return",
      cancel_url: "https://kjmride.com/?payment_verification=cancelled",
      send_email_receipt: false, show_line_items: true, show_description: true,
    });
    // Save the provider identity even if response validation fails, to allow recovery.
    saved.sessionId = session?.id;
    saved.state = "provider_response_received";
    fs.writeFileSync(stateFile, JSON.stringify(saved), { mode: 0o600 });
    const a = validate(session, saved.reference);
    saved.checkoutUrl = a.checkout_url;
    saved.state = "session_created";
    fs.writeFileSync(stateFile, JSON.stringify(saved), { mode: 0o600 });
  }
  if (!/^cs_[A-Za-z0-9]+$/.test(saved.sessionId || "")) throw Error("Previous creation unresolved; investigate by reference without creating another session");
  const a = validate(await provider(`/${saved.sessionId}`), saved.reference);
  const paid = (a.payments || []).filter(p => p.attributes?.status === "paid");
  const verified = paid.length === 1 && paid[0].attributes.amount === 1000 && paid[0].attributes.currency === "PHP" &&
    paid[0].attributes.livemode === true && !paid[0].attributes.disputed && !(paid[0].attributes.refunds || []).length;
  console.log(JSON.stringify({ sessionId: saved.sessionId, amountPHP: 10, verifiedPaid: verified, status: a.status,
    ...(command === "create" && !paid.length && a.status === "active" ? { checkoutUrl: a.checkout_url } : {}) }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
