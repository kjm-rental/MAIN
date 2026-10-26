import { expect, it, vi } from "vitest";
import { notificationReady } from "./readiness";
it("requires installed guest binding protections, explicit activation, and database delivery switch", async () => {
  const ready = {
    guest_binding_ready: true,
    activation_recorded: true,
    resend_enabled: true,
    reminders_enabled: true,
  };
  expect(await notificationReady(vi.fn().mockResolvedValue(ready), true)).toBe(
    true,
  );
  for (const key of Object.keys(ready))
    expect(
      await notificationReady(
        vi.fn().mockResolvedValue({ ...ready, [key]: false }),
        true,
      ),
    ).toBe(false);
  expect(await notificationReady(vi.fn().mockResolvedValue(null), false)).toBe(
    false,
  );
});
