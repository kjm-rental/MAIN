import { serviceSelectionSchema } from "@/lib/delivery/schema";
import { z } from "zod";
import { bookingCustomerSchema } from "@/lib/booking";
export function customerFieldErrors(value: unknown): Record<string, string> {
  const result = bookingCustomerSchema.safeParse(value);
  if (result.success) return {};
  const messages: Record<string, string> = {
    fullName: "Please enter your full name.",
    email: "Please enter a valid email address.",
    phone: "Please enter a valid phone number.",
    country: "Please select your country.",
    customerType: "Please select your customer type.",
  };
  return Object.fromEntries(
    result.error.issues.map((issue) => [
      String(issue.path[0]),
      messages[String(issue.path[0])] ?? "Please check this field.",
    ]),
  );
}
export const guestRequestSchema = z
  .object({
    p_services: serviceSelectionSchema.optional(),
    p_expected_delivery_centavos: z
      .number()
      .int()
      .min(0)
      .max(10000000)
      .optional(),
    p_expected_collection_centavos: z
      .number()
      .int()
      .min(0)
      .max(10000000)
      .optional(),
    p_expected_service_centavos: z
      .number()
      .int()
      .min(0)
      .max(20000000)
      .optional(),
    p_payment_method: z.enum(["cash", "qrph"]).optional(),
    p_idempotency_key: z.uuid(),
    p_model_id: z.uuid(),
    p_start_at: z.iso.datetime(),
    p_end_at: z.iso.datetime(),
    p_extra_items: z
      .array(
        z.object({ id: z.uuid(), quantity: z.number().int().min(1).max(100) }),
      )
      .max(20),
    p_full_name: z.string().trim().min(2).max(160),
    p_email: z.email().trim().max(254),
    p_phone: z.string().regex(/^\+?[0-9][0-9\s()-]{6,24}$/),
    p_country: z.string().trim().min(2).max(100),
    p_customer_type: z.enum(["philippine_resident", "international_visitor"]),
    p_identity_name: z.string().trim().min(1).max(160),
    p_license_name: z.string().trim().min(1).max(160),
    p_license_country: z.string().trim().min(1).max(100),
    p_license_expiration: z.iso.date(),
    p_vehicle_categories: z.string().trim().min(1).max(200),
    p_entry_date: z.iso.date().nullable(),
    p_privacy_consent: z.literal(true),
    p_declaration: z.literal(true),
    p_deposit_option: z.enum(["cash", "eligible_id"]),
    p_policy_version: z.string().min(1).max(100),
    p_document_type: z.string().max(100).nullable(),
    captchaToken: z.string().max(4096),
  })
  .refine(
    (p) =>
      Date.parse(p.p_start_at) > Date.now() &&
      Date.parse(p.p_end_at) - Date.parse(p.p_start_at) >= 86400000,
    "Invalid rental period",
  );
export const documentKinds = [
  "government_id",
  "passport",
  "drivers_license_front",
  "drivers_license_back",
  "international_driving_permit",
  "supporting_document",
] as const;
