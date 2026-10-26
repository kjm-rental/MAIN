import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ account: vi.fn(), available: vi.fn() }));
vi.mock("@/lib/paymongo/test-payments", async (original) => ({
  ...(await original<typeof import("@/lib/paymongo/test-payments")>()),
  accountMethods: mocks.account,
  availableMethods: mocks.available,
}));
import { GET } from "./route";
it("returns no online capabilities without contacting PayMongo or the database", async () => {
  const response = await GET();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ methods: [], onlineEnabled: false });
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(mocks.account).not.toHaveBeenCalled();
  expect(mocks.available).not.toHaveBeenCalled();
});
