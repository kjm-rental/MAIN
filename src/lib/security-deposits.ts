import { z } from "zod";
export const depositOptionsSchema = z
  .object({
    cash_enabled: z.boolean(),
    cash_amount_centavos: z.number().int().positive().nullable(),
    id_enabled: z.boolean(),
    accepted_document_types: z.array(z.string().trim().min(1).max(120)),
    collection_instructions: z.string(),
    return_instructions: z.string(),
    dispute_instructions: z.string(),
    policy_version: z.string(),
  })
  .superRefine((value, ctx) => {
    if (value.cash_enabled && value.cash_amount_centavos === null)
      ctx.addIssue({
        code: "custom",
        message: "Cash deposit amount is not configured",
      });
    if (value.id_enabled && !value.accepted_document_types.length)
      ctx.addIssue({ code: "custom", message: "No approved document types" });
  });
export type DepositOptions = z.infer<typeof depositOptionsSchema>;
export function pickupCashTotal(
  rentalCentavos: number,
  depositCentavos: number,
) {
  if (
    !Number.isSafeInteger(rentalCentavos) ||
    rentalCentavos < 0 ||
    !Number.isSafeInteger(depositCentavos) ||
    depositCentavos < 0 ||
    !Number.isSafeInteger(rentalCentavos + depositCentavos)
  )
    throw Error("Invalid cash totals");
  return rentalCentavos + depositCentavos;
}
export function isMissingDepositSchema(error: { code?: string } | null) {
  return Boolean(
    error && ["42P01", "PGRST202", "PGRST205"].includes(error.code ?? ""),
  );
}
