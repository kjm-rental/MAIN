/* eslint-disable @typescript-eslint/no-require-imports -- Local Node-only diagnostic. */
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { createHash } = require("node:crypto");
const { z } = require("zod");
const root = path.resolve(__dirname, "..");

/** Defaults to dry-run. No Supabase client, database access, outbox or scheduler. */
async function main(options = {}) {
  const argv = options.argv ?? process.argv.slice(2);
  if (
    argv.length > 1 ||
    (argv.length === 1 && !["--dry-run", "--send"].includes(argv[0]))
  ) {
    throw new Error(
      "Use --dry-run or --send. Recipient overrides are not supported.",
    );
  }
  if (!options.env) require("@next/env").loadEnvConfig(root);
  const env = options.env ?? process.env;
  if (
    env.RESEND_ENABLED !== "false" ||
    env.NOTIFICATION_REMINDERS_ENABLED !== "false"
  ) {
    throw new Error(
      "Both normal delivery and reminders must remain explicitly false.",
    );
  }
  const apiKey = env.RESEND_API_KEY?.trim();
  const recipient = env.RESEND_TEST_RECIPIENT?.trim();
  if (!apiKey || !apiKey.startsWith("re_") || /\s/.test(apiKey))
    throw new Error("Server-side Resend key is missing or malformed.");
  if (!z.email().safeParse(recipient).success)
    throw new Error("Test recipient is missing or malformed.");
  const { BRAND, render } = await import(
    pathToFileURL(path.join(root, "src/lib/notifications/templates.ts")).href
  );
  const rendered = render("booking_approved", {
    bookingId: "11111111-1111-4111-8111-111111111111",
    reference: "KJM-EMAIL-TEST-NOT-A-BOOKING",
    motorcycle: "Synthetic motorcycle — email layout test only",
    pickupAt: "2030-01-01T01:00:00Z",
    returnAt: "2030-01-02T01:00:00Z",
    rentalCentavos: 70000,
  });
  const notice =
    "TEST ONLY: All booking details below are fictional. No booking was created, no payment occurred, and no identity verification was performed.";
  const body = {
    from: BRAND.from,
    to: [recipient],
    reply_to: BRAND.reply,
    subject: "[TEST ONLY] KJM email configuration test — no booking created",
    html: rendered.html.replace(
      "<h1",
      `<p style="font-weight:bold;color:#153f40">${notice}</p><h1`,
    ),
    text: `${notice}\n\n${rendered.text}`,
  };
  const serialized = JSON.stringify(body);
  const fingerprint = createHash("sha256").update(serialized).digest("hex");
  const directory =
    options.attemptDirectory ?? path.join(root, ".resend-smoke-test");
  const attemptPath = path.join(directory, "attempt.json");
  const summary = {
    mode: argv[0] === "--send" ? "send" : "dry-run",
    apiKeyAvailable: true,
    testRecipientConfigured: true,
    normalDeliveryDisabled: true,
    remindersDisabled: true,
    databaseAccess: false,
    existingTemplateReused: true,
    priorAttemptRecorded: fs.existsSync(attemptPath),
    emailSent: false,
  };
  if (summary.mode === "dry-run") return summary;
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const attemptedAt = new Date().toISOString();
  // Exclusive creation prevents two local commands from sending simultaneously.
  // Any prior attempt, even failed/ambiguous, blocks reruns. Never delete automatically.
  try {
    fs.writeFileSync(
      attemptPath,
      JSON.stringify({ state: "attempting", attemptedAt, fingerprint }),
      { flag: "wx", mode: 0o600 },
    );
  } catch {
    throw new Error(
      "Test attempt blocked. Review the existing local attempt record before any further send.",
    );
  }
  const record = (state) =>
    fs.writeFileSync(
      attemptPath,
      JSON.stringify({ state, attemptedAt, fingerprint }),
      { mode: 0o600 },
    );
  let response;
  try {
    response = await (options.transport ?? fetch)(
      "https://api.resend.com/emails",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `kjm/local-smoke-test/${fingerprint}`,
        },
        body: serialized,
        signal: AbortSignal.timeout(10000),
      },
    );
  } catch {
    record("ambiguous");
    throw new Error(
      "Test outcome is uncertain. Do not resend; check Resend activity first.",
    );
  }
  if (!response.ok) {
    record("provider_error");
    throw new Error(
      `Provider returned HTTP ${response.status}. No automatic retry will run.`,
    );
  }
  let providerId;
  try {
    providerId = z
      .object({ id: z.string().min(1).max(128) })
      .parse(await response.json()).id;
  } catch {
    record("ambiguous");
    throw new Error(
      "Provider acceptance is uncertain. Do not resend; check Resend activity first.",
    );
  }
  fs.writeFileSync(
    attemptPath,
    JSON.stringify({
      state: "provider_accepted",
      attemptedAt,
      fingerprint,
      providerId,
    }),
    { mode: 0o600 },
  );
  return { ...summary, emailSent: true, providerAccepted: true };
}
module.exports = { main };
if (require.main === module) {
  main()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      // Only deliberately authored messages; never print provider bodies, credentials or recipients.
      const safe =
        /^(Use |Both |Server-side |Test recipient |Test attempt |Test outcome |Provider returned HTTP |Provider acceptance )/.test(
          error.message,
        );
      console.error(
        safe
          ? error.message
          : "Email test could not safely complete. No automatic retry will run.",
      );
      process.exitCode = 1;
    });
}
