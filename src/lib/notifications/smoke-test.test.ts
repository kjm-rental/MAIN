import { createRequire } from "node:module";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const { main } = createRequire(import.meta.url)(
  "../../../scripts/resend-smoke-test.cjs",
);
const env = {
  RESEND_ENABLED: "false",
  NOTIFICATION_REMINDERS_ENABLED: "false",
  RESEND_API_KEY: "re_fake_unit_test_key",
  RESEND_TEST_RECIPIENT: "controlled@example.test",
};
let directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "kjm-smoke-unit-"));
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});
function harness() {
  const transport = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ id: "fake-provider-id" })),
    );
  return {
    transport,
    options: { env, attemptDirectory: directory, transport },
  };
}
it("dry run never contacts a provider or database", async () => {
  const h = harness();
  expect(await main({ ...h.options, argv: [] })).toMatchObject({
    mode: "dry-run",
    emailSent: false,
    databaseAccess: false,
  });
  expect(h.transport).not.toHaveBeenCalled();
});
it("blocks either normal delivery or reminders being enabled", async () => {
  const h = harness();
  for (const flag of ["RESEND_ENABLED", "NOTIFICATION_REMINDERS_ENABLED"]) {
    await expect(
      main({ ...h.options, argv: ["--send"], env: { ...env, [flag]: "true" } }),
    ).rejects.toThrow("explicitly false");
  }
  expect(h.transport).not.toHaveBeenCalled();
});
it("rejects a recipient override flag", async () => {
  const h = harness();
  await expect(
    main({ ...h.options, argv: ["--to=other@example.test"] }),
  ).rejects.toThrow("overrides");
  expect(h.transport).not.toHaveBeenCalled();
});
it("requires a configured valid recipient", async () => {
  const h = harness();
  await expect(
    main({
      ...h.options,
      argv: ["--send"],
      env: { ...env, RESEND_TEST_RECIPIENT: "" },
    }),
  ).rejects.toThrow("recipient");
  expect(h.transport).not.toHaveBeenCalled();
});
it("sends only one fictional message to the configured safe mailbox (mock provider)", async () => {
  const h = harness();
  const result = await main({ ...h.options, argv: ["--send"] });
  expect(result.providerAccepted).toBe(true);
  expect(h.transport).toHaveBeenCalledTimes(1);
  const [url, req] = h.transport.mock.calls[0];
  expect(url).toBe("https://api.resend.com/emails");
  const body = JSON.parse(req.body);
  expect(body.to).toEqual([env.RESEND_TEST_RECIPIENT]);
  expect(body.subject).toContain("[TEST ONLY]");
  expect(body.text).toContain("No booking was created");
  expect(body).not.toHaveProperty("cc");
  expect(body).not.toHaveProperty("bcc");
  expect(JSON.stringify(result)).not.toContain(env.RESEND_API_KEY);
  expect(JSON.stringify(result)).not.toContain(env.RESEND_TEST_RECIPIENT);
});
it("blocks a repeat invocation after provider acceptance", async () => {
  const h = harness();
  await main({ ...h.options, argv: ["--send"] });
  await expect(main({ ...h.options, argv: ["--send"] })).rejects.toThrow(
    "blocked",
  );
  expect(h.transport).toHaveBeenCalledTimes(1);
});
it("holds timeouts for review and never retries", async () => {
  const h = harness();
  h.transport.mockRejectedValue(new Error("private provider detail"));
  await expect(main({ ...h.options, argv: ["--send"] })).rejects.toThrow(
    "uncertain",
  );
  await expect(main({ ...h.options, argv: ["--send"] })).rejects.toThrow(
    "blocked",
  );
  expect(h.transport).toHaveBeenCalledTimes(1);
  expect(readFileSync(join(directory, "attempt.json"), "utf8")).not.toContain(
    env.RESEND_API_KEY,
  );
});
it("does not echo provider errors and blocks automatic retry", async () => {
  const h = harness();
  h.transport.mockResolvedValue(new Response("SECRET BODY", { status: 401 }));
  await expect(main({ ...h.options, argv: ["--send"] })).rejects.toThrow(
    "HTTP 401",
  );
  await expect(main({ ...h.options, argv: ["--send"] })).rejects.toThrow(
    "blocked",
  );
  expect(h.transport).toHaveBeenCalledTimes(1);
});
