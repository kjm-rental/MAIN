/* eslint-disable @typescript-eslint/no-require-imports -- Node's standalone test runner. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { run } = require("./notifications-dispatch.cjs");
const env = {
  KJM_NOTIFICATION_DISPATCH_SECRET: "e".repeat(64),
  KJM_ADMIN_NOTIFICATION_CRON_SECRET: "t".repeat(64),
};
const reply = (body) => ({ ok: true, json: async () => body });

test("validates both secrets before contacting a worker", async () => {
  await assert.rejects(
    run({
      env: { ...env, KJM_ADMIN_NOTIFICATION_CRON_SECRET: "" },
      fetcher: () => assert.fail("Unexpected request"),
    }),
  );
});
test("sends each credential only to its fixed HTTPS worker and blocks redirects", async () => {
  const calls = [];
  const results = await run({
    env,
    fetcher: async (url, options) => {
      calls.push([url, options]);
      return url.includes("kjmadmin")
        ? reply({ mode: "live", processed: 0, failed: 0 })
        : reply({ results: ["idle"] });
    },
  });
  assert.deepEqual(results, [
    { channel: "email", ok: true },
    { channel: "owner", ok: true },
  ]);
  assert.equal(calls[0][0], "https://kjmride.com/api/notifications/dispatch");
  assert.equal(
    calls[1][0],
    "https://kjmadmin.vercel.app/api/internal/notifications",
  );
  assert.equal(
    calls[0][1].headers.Authorization,
    `Bearer ${env.KJM_NOTIFICATION_DISPATCH_SECRET}`,
  );
  assert.equal(
    calls[1][1].headers.Authorization,
    `Bearer ${env.KJM_ADMIN_NOTIFICATION_CRON_SECRET}`,
  );
  assert.ok(
    calls.every(
      ([, options]) =>
        options.redirect === "error" && options.method === "POST",
    ),
  );
});
test("disabled, malformed and failed deliveries do not pass readiness", async () => {
  for (const body of [
    { status: "disabled" },
    { results: ["configuration"] },
    {},
    { mode: "live", processed: 1, failed: 1 },
  ]) {
    const results = await run({ env, fetcher: async () => reply(body) });
    assert.ok(results.every(({ ok }) => !ok));
  }
});
test("an email failure does not prevent the independent owner worker", async () => {
  let count = 0;
  const results = await run({
    env,
    fetcher: async () => {
      if (++count === 1) throw Error("PRIVATE provider body");
      return reply({ mode: "live", processed: 1, failed: 0 });
    },
  });
  assert.deepEqual(results, [
    { channel: "email", ok: false },
    { channel: "owner", ok: true },
  ]);
});
