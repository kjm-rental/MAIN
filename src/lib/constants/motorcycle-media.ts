import type { MotorcycleMedia } from "@/types/motorcycle";

/**
 * Approved local dealership-style photography. Keep this empty until KJM or an
 * authorized media owner supplies an exact-model asset with written commercial
 * website permission. Casual reference photography is intentionally excluded.
 */
export const APPROVED_LOCAL_MOTORCYCLE_MEDIA: Readonly<
  Record<string, MotorcycleMedia>
> = {};

export function getApprovedLocalMotorcycleMedia(
  slug: string,
): MotorcycleMedia | undefined {
  return APPROVED_LOCAL_MOTORCYCLE_MEDIA[slug];
}
