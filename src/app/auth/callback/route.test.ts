import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ getUser: vi.fn(), exchange: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: m.getUser, exchangeCodeForSession: m.exchange },
  }),
}));
import { GET } from "./route";
const path = "/booking/status/11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  vi.resetAllMocks();
  m.getUser.mockResolvedValue({ data: { user: { id: "owner" } } });
  m.exchange.mockResolvedValue({ data: { user: { id: "owner" } } });
});
it("rejects external redirect destinations before exchanging tokens", async () => {
  const response = await GET(
    new Request(
      "http://localhost:3000/auth/callback?code=test&next=https://attacker.test",
    ),
  );
  expect(response.status).toBe(400);
  expect(m.exchange).not.toHaveBeenCalled();
});
it("returns to the protected booking after a same-owner PKCE exchange", async () => {
  const response = await GET(
    new Request(
      "http://localhost:3000/auth/callback?code=test&next=" +
        encodeURIComponent(path),
    ),
  );
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("http://localhost:3000" + path);
});
it("rejects session substitution and failed exchanges", async () => {
  m.exchange.mockResolvedValue({ data: { user: { id: "someone-else" } } });
  expect(
    (
      await GET(
        new Request(
          "http://localhost:3000/auth/callback?code=test&next=" +
            encodeURIComponent(path),
        ),
      )
    ).status,
  ).toBe(400);
});

it("allows the same-owner verified email change to return to checkout", async () => {
  const response = await GET(
    new Request(
      "http://localhost:3000/auth/callback?code=test&next=/book/honda-click-125",
    ),
  );
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(
    "http://localhost:3000/book/honda-click-125",
  );
});
it("rejects protocol-relative destinations and encoded open redirects", async () => {
  for (const next of [
    "//attacker.test",
    "/book/../../attacker",
    "/book?next=https://attacker.test",
  ]) {
    expect(
      (
        await GET(
          new Request(
            "http://localhost:3000/auth/callback?code=test&next=" +
              encodeURIComponent(next),
          ),
        )
      ).status,
    ).toBe(400);
  }
});
