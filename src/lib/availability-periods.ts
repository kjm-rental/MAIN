import { type RentalTimeKind } from "./rental-time-slots";
export type AvailabilityContext = {
  modelId: string;
  kind: RentalTimeKind;
  pickup?: string;
  returnAt?: string;
  durationMinutes: number;
};
export type AvailabilityPeriod = {
  key: string;
  start_at: string;
  end_at: string;
};
export function availabilityPeriod(
  value: string,
  context: AvailabilityContext,
): AvailabilityPeriod | null {
  const instant = (local: string) => new Date(`${local}:00+08:00`).getTime();
  const start =
    context.kind === "pickup"
      ? instant(value)
      : context.pickup
        ? instant(context.pickup)
        : NaN;
  const end =
    context.kind === "return"
      ? instant(value)
      : context.returnAt
        ? instant(context.returnAt)
        : start + context.durationMinutes * 60000;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    return null;
  return {
    key: value,
    start_at: new Date(start).toISOString(),
    end_at: new Date(end).toISOString(),
  };
}
