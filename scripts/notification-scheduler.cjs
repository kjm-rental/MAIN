// Local scheduled workers. Never log credentials, payloads, customer details or provider URLs.
const fs = require("node:fs");
const path = require("node:path");
const { parseEnv } = require("node:util");
async function tick() {
  const env = parseEnv(
    fs.readFileSync(path.resolve(__dirname, "../.env.local"), "utf8"),
  );
  const jobs = [];
  if (env.RESEND_ENABLED === "true")
    jobs.push([
      "email",
      "http://127.0.0.1:3000/api/notifications/dispatch",
      env.NOTIFICATION_DISPATCH_SECRET,
    ]);
  // Separate channel worker preserves the existing Telegram transport and outbox leases.
  jobs.push([
    "owner",
    "http://127.0.0.1:3001/api/internal/notifications",
    env.NOTIFICATION_DISPATCH_SECRET,
  ]);
  const results = await Promise.all(
    jobs.map(async ([channel, url, secret]) => {
      try {
        if (!secret || secret.length < 32) throw new Error();
        const response = await fetch(url, {
          method: "POST",
          headers: { authorization: `Bearer ${secret}` },
          signal: AbortSignal.timeout(55000),
        });
        if (!response.ok) throw new Error();
        const data = await response.json();
        const state =
          data.status === "telegram_activation_required"
            ? "activation required"
            : "batch completed";
        console.log(`Notification dispatcher ${channel}: ${state}.`);
        return true;
      } catch {
        console.error(
          `Notification dispatcher ${channel}: blocked; check app, authentication and database activation.`,
        );
        return false;
      }
    }),
  );
  if (results.some((ok) => !ok))
    throw new Error("A notification channel is unavailable");
}
if (require.main === module)
  tick().catch(() => {
    process.exitCode = 1;
  });
module.exports = { tick };
