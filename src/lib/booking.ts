import { z } from "zod";

export const bookingCustomerSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  email: z.email().trim(),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9][0-9\s()-]{6,24}$/),
  country: z.string().trim().min(2).max(100),
  customerType: z.enum(["philippine_resident", "international_visitor"]),
});

export function manilaInputToIso(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error("Invalid date and time.");
  const date = new Date(`${value}:00+08:00`);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid date and time.");
  return date.toISOString();
}

export function validateRentalPeriod(
  startInput: string,
  endInput: string,
  now = new Date(),
) {
  const start = new Date(manilaInputToIso(startInput));
  const end = new Date(manilaInputToIso(endInput));
  if (start <= now) throw new Error("Pickup must be in the future.");
  if (end <= start) throw new Error("Return must be after pickup.");
  if (end.getTime() - start.getTime() < 86400000)
    throw new Error("Minimum rental duration is 24 hours.");
  return { startAt: start.toISOString(), endAt: end.toISOString() };
}

export function estimatedStartedDays(startAt: string, endAt: string) {
  return Math.max(
    1,
    Math.ceil(
      (new Date(endAt).getTime() - new Date(startAt).getTime()) / 86_400_000,
    ),
  );
}
