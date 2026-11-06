const jobs = [
  [
    "email",
    "https://kjmride.com/api/notifications/dispatch",
    "KJM_NOTIFICATION_DISPATCH_SECRET",
  ],
  [
    "owner",
    "https://kjmadmin.vercel.app/api/internal/notifications",
    "KJM_ADMIN_NOTIFICATION_CRON_SECRET",
  ],
];

async function run({ env = process.env, fetcher = fetch } = {}) {
  // Validate both credentials before contacting either worker.
  if (jobs.some(([, , key]) => !env[key] || env[key].length < 32))
    throw new Error("Both notification worker secrets must be configured.");
  const results = [];
  for (const [channel, url, key] of jobs) {
    try {
      const response = await fetcher(url, {
        method: "POST",
        redirect: "error",
        headers: { Authorization: `Bearer ${env[key]}` },
        signal: AbortSignal.timeout(55000),
      });
      if (!response.ok) throw new Error();
      const data = await response.json();
      // A 200 disabled response is not evidence of successful delivery setup.
      const active =
        channel === "email"
          ? Array.isArray(data.results) &&
            data.results.length > 0 &&
            data.results.every((value) =>
              ["sent", "idle", "cancelled"].includes(value),
            )
          : data.mode === "live" &&
            Number.isInteger(data.processed) &&
            Number.isInteger(data.failed) &&
            data.failed === 0;
      results.push({ channel, ok: active });
    } catch {
      // Provider bodies, credentials, customer details and URLs stay out of logs.
      results.push({ channel, ok: false });
    }
  }
  return results;
}

if (require.main === module) {
  run()
    .then((results) => {
      for (const { channel, ok } of results)
        console.log(
          `Notification ${channel} worker: ${ok ? "completed" : "requires review"}.`,
        );
      if (results.some(({ ok }) => !ok)) process.exitCode = 1;
    })
    .catch(() => {
      console.error(
        "Notification scheduling unavailable; check worker configuration.",
      );
      process.exitCode = 1;
    });
}
module.exports = { run };
