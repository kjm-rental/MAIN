import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/guest-checkout/server", () => ({
  guestDb: () => ({ rpc: m.rpc }),
  sameOrigin: (r: Request) => r.headers.get("origin") === new URL(r.url).origin,
  guestResponse: (d: unknown, status = 200) => Response.json(d, { status }),
}));
import { POST } from "./route";
const request = (body: unknown, origin = "http://localhost:3000") =>
  new Request("http://localhost:3000/api/delivery/quote", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const leg = {
    areaId: "10000000-0000-4000-8000-000000000001",
    address: "Hotel street 123",
  },
  base = {
    selection: { delivery: leg, collection: null },
    start: "2030-01-01T01:00:00Z",
    end: "2030-01-03T01:00:00Z",
  };
beforeEach(() => {
  vi.clearAllMocks();
  m.rpc.mockResolvedValue({
    data: {
      deliveryFeeCentavos: 20000,
      collectionFeeCentavos: 0,
      totalCentavos: 20000,
    },
    error: null,
  });
});
it("requires same origin before requesting any pricing", async () => {
  expect((await POST(request(base, "https://other.example"))).status).toBe(403);
  expect(m.rpc).not.toHaveBeenCalled();
});
it("uses server pricing and strips browser amounts", async () => {
  const r = await POST(
    request({
      ...base,
      amount: 1,
      selection: { delivery: { ...leg, price: 1 }, collection: null },
    }),
  );
  expect(r.status).toBe(200);
  expect((await r.json()).totalCentavos).toBe(20000);
  expect(m.rpc.mock.calls[0][1].p_selection.delivery).not.toHaveProperty(
    "price",
  );
});
it("shows friendly unavailable-area/hours errors without SQL details", async () => {
  m.rpc.mockResolvedValue({ data: null, error: { message: "private SQL" } });
  const r = await POST(request(base));
  expect(r.status).toBe(400);
  const body = await r.json();
  expect(body.error).toContain("operating hours");
  expect(body.error).not.toContain("private SQL");
});
it("rejects invalid address before requesting price", async () => {
  expect(
    (
      await POST(
        request({ ...base, selection: { delivery: { ...leg, address: "" } } }),
      )
    ).status,
  ).toBe(400);
  expect(m.rpc).not.toHaveBeenCalled();
});
