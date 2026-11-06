export type ExtraRules = {
  name: string;
  max_per_booking: number;
  total_quantity: number;
  compatible_model_ids?: string[];
  compatible_unit_ids?: string[];
};
export function isTopBox(name: string) {
  return /(?:top|back)[ _-]*box/i.test(name);
}
export function extraQuantityLimit(extra: ExtraRules) {
  const accessoryLimit = /^(helmets?|raincoats?)$/i.test(extra.name.trim())
    ? 2
    : isTopBox(extra.name)
      ? 1
      : extra.max_per_booking;
  return Math.max(
    0,
    Math.min(accessoryLimit, extra.max_per_booking, extra.total_quantity),
  );
}
export function extraFitsMotorcycle(extra: ExtraRules, modelId?: string) {
  const models = extra.compatible_model_ids ?? [];
  if (isTopBox(extra.name))
    return Boolean(
      extra.compatible_unit_ids?.length &&
      modelId &&
      (!models.length || models.includes(modelId)),
    );
  return models.length ? Boolean(modelId && models.includes(modelId)) : true;
}
