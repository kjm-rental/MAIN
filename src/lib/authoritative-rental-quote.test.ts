import { expect, it, vi } from "vitest";
import { authoritativeRentalQuote } from "./authoritative-rental-quote";
const args = {
  p_model_id: "model",
  p_start_at: "2030-01-01T00:00:00Z",
  p_end_at: "2030-01-03T05:00:00Z",
  p_extra_items: [],
};
function client(rpc: ReturnType<typeof vi.fn>) {
  return { rpc } as unknown as Parameters<typeof authoritativeRentalQuote>[0];
}
it("displays server totals and snapshots unchanged rather than calculating client totals", async () => {
  const data = {
    total_centavos: 175000,
    rental_pricing: {
      baseChargePhp: 1400,
      additionalHours: 5,
      extensionChargePhp: 350,
    },
  };
  const rpc = vi.fn().mockResolvedValue({ data, error: null });
  expect((await authoritativeRentalQuote(client(rpc), args)).data).toEqual([
    data,
  ]);
  expect(rpc).toHaveBeenCalledWith("get_booking_quote_v4", {
    ...args,
    p_deposit_option: null,
    p_document_type: null,
  });
});
it("preserves legacy quoting only when the detailed RPC is absent", async () => {
  const rpc = vi
    .fn()
    .mockResolvedValueOnce({ data: null, error: { code: "PGRST202" } })
    .mockResolvedValueOnce({ data: [{ total_centavos: 210000 }], error: null });
  expect((await authoritativeRentalQuote(client(rpc), args)).data).toEqual([
    { total_centavos: 210000 },
  ]);
  expect(rpc.mock.calls[1]).toEqual(["get_booking_quote_v2", args]);
});
it("keeps the existing authoritative deposit quote in a pre-migration database", async () => {
  const rpc = vi
    .fn()
    .mockResolvedValueOnce({ data: null, error: { code: "42883" } })
    .mockResolvedValueOnce({
      data: [{ deposit_required_centavos: 250000 }],
      error: null,
    });
  await authoritativeRentalQuote(client(rpc), args, {
    option: "cash",
    document: null,
  });
  expect(rpc.mock.calls[1][0]).toBe("get_booking_quote_v3");
});
it("never hides pricing or authorization failures behind fallback quotes", async () => {
  const error = { code: "P0001", message: "Not authorized" };
  const rpc = vi.fn().mockResolvedValue({ data: null, error });
  expect((await authoritativeRentalQuote(client(rpc), args)).error).toBe(error);
  expect(rpc).toHaveBeenCalledTimes(1);
});
