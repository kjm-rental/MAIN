// Production recovery worker. Logs counts only, never credentials or payment payloads.
const endpoint = "https://kjmride.com/api/paymongo/reconcile";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reviewStates = new Set(["retry_required", "creation_unresolved", "review_required"]);

async function run({ secret, fetcher = fetch, maxBatches = 100 } = {}) {
  if (typeof secret !== "string" || secret.length < 32)
    throw new Error("Configure the live reconciliation secret");
  let after = null;
  let checked = 0;
  let problems = 0;
  const seen = new Set();
  for (let page = 0; page < maxBatches; page++) {
    const response = await fetcher(endpoint, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(65000),
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ after }),
    });
    if (!response.ok) throw new Error(`Reconciliation endpoint returned HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.results) || data.results.length > 5 ||
        !data.results.every(item => item && typeof item.status === "string") ||
        !(data.nextCursor === null || (typeof data.nextCursor === "string" && uuid.test(data.nextCursor))))
      throw new Error("Invalid reconciliation response");
    checked += data.results.length;
    problems += data.results.filter(item => reviewStates.has(item.status)).length;
    if (data.nextCursor === null) return { checked, problems };
    if (seen.has(data.nextCursor)) throw new Error("Reconciliation cursor repeated");
    seen.add(data.nextCursor);
    after = data.nextCursor;
  }
  throw new Error("Reconciliation batch limit reached; investigate backlog");
}

if (require.main === module) {
  run({ secret: process.env.PAYMONGO_LIVE_RECONCILIATION_SECRET })
    .then(({ checked, problems }) => {
      console.log(`Live reconciliation: ${checked} checked; ${problems} require operator review.`);
      if (problems) process.exitCode = 1;
    })
    .catch(() => {
      console.error("Live reconciliation failed. Check endpoint configuration, authentication and payment backlog.");
      process.exitCode = 1;
    });
}
module.exports = { run };
