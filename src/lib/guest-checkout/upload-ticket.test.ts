import { beforeEach, expect, it, vi } from "vitest";
import { signUploadTicket, verifyUploadTicket } from "./upload-ticket";
const id = "11111111-1111-4111-8111-111111111111";
const ticket = {
  bookingId: id,
  hash: "browser-one",
  kind: "government_id" as const,
  path: `guest/${id}/unique`,
  size: 8_388_608,
  mimeType: "image/jpeg" as const,
  expires: Date.now() + 60_000,
};
beforeEach(() => vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only-secret"));
it("binds upload completion to the booking, browser, exact size, type and path", () => {
  const signed = signUploadTicket(ticket);
  expect(verifyUploadTicket(signed, id, ticket.hash)).toEqual(ticket);
  expect(verifyUploadTicket(signed, id, "different-browser")).toBeNull();
  expect(
    verifyUploadTicket(
      signed,
      "22222222-2222-4222-8222-222222222222",
      ticket.hash,
    ),
  ).toBeNull();
  expect(
    verifyUploadTicket(signed.replace(signed[0], "x"), id, ticket.hash),
  ).toBeNull();
  expect(
    verifyUploadTicket(
      signUploadTicket({ ...ticket, expires: 1 }),
      id,
      ticket.hash,
    ),
  ).toBeNull();
});
