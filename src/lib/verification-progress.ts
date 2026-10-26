import { z } from "zod";
const summary = z.object({
  preliminaryStatus: z.enum([
    "passed",
    "correction_required",
    "manual_review_required",
  ]),
  riskLevel: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  riskStatus: z
    .enum([
      "DOCUMENT_CHECKS_PASSED",
      "MANUAL_REVIEW_REQUIRED",
      "CORRECTION_REQUIRED",
    ])
    .optional(),
  reviewReasons: z.array(z.string()).optional(),
  identityReviewRequired: z.literal(true).optional(),
  checkedAt: z.string(),
  corrections: z.array(
    z.object({ documentKind: z.string(), message: z.string() }),
  ),
  checks: z.array(
    z.object({
      label: z.string(),
      status: z.enum(["passed", "manual", "failed"]),
      detail: z.string(),
    }),
  ),
});
export const progressSchema = z.object({
  overallStatus: z.string(),
  uploadKinds: z.array(
    z.enum([
      "government_id",
      "passport",
      "drivers_license_front",
      "drivers_license_back",
      "international_driving_permit",
      "supporting_document",
    ]),
  ),
  checks: z.array(
    z.object({
      id: z.string(),
      createdAt: z.string(),
      current: z.boolean(),
      summary,
    }),
  ),
  reviews: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      result: z.string(),
      reason: z.string().nullable(),
      createdAt: z.string(),
    }),
  ),
});
export type VerificationProgress = z.infer<typeof progressSchema>;
export function parseVerificationProgress(
  value: unknown,
): VerificationProgress | null {
  const result = progressSchema.safeParse(value);
  return result.success ? result.data : null;
}
