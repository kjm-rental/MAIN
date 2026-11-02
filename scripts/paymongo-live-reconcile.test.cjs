/* eslint-disable @typescript-eslint/no-require-imports -- Node's built-in test runner for the standalone worker. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { run } = require("./paymongo-live-reconcile.cjs");
const secret = "a".repeat(64);
const cursor = "12345678-1234-1234-1234-123456789abc";
const response = data => ({ ok: true, json: async () => data });

test("requires a secret before contacting the endpoint", async () => {
  await assert.rejects(run({ fetcher: () => assert.fail("Unexpected request") }));
});
test("follows the cursor and retains review failures across pages", async () => {
  const requests = [];
  const result = await run({ secret, fetcher: async (url, init) => {
    assert.equal(url, "https://kjmride.com/api/paymongo/reconcile");
    assert.equal(init.redirect, "error");
    assert.equal(init.headers.Authorization, `Bearer ${secret}`);
    requests.push(JSON.parse(init.body));
    return requests.length === 1
      ? response({ results: [{ status: "retry_required" }], nextCursor: cursor })
      : response({ results: [{ status: "paid" }], nextCursor: null });
  }});
  assert.deepEqual(requests, [{ after: null }, { after: cursor }]);
  assert.deepEqual(result, { checked: 2, problems: 1 });
});
test("rejects HTTP failures and malformed pagination", async () => {
  await assert.rejects(run({ secret, fetcher: async () => ({ ok: false, status: 401 }) }), /HTTP 401/);
  await assert.rejects(run({ secret, fetcher: async () => response({ results: [], nextCursor: "invalid" }) }), /Invalid/);
});
test("stops a repeated cursor and bounds the batch count", async () => {
  const fetcher = async () => response({ results: [], nextCursor: cursor });
  await assert.rejects(run({ secret, fetcher }), /cursor repeated/);
  await assert.rejects(run({ secret, fetcher, maxBatches: 1 }), /batch limit/);
});
