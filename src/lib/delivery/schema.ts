import { z } from "zod";
export const serviceAddressSchema = z.object({
  areaId: z.uuid(),
  address: z.string().trim().min(5).max(500),
  hotel: z.string().trim().max(150).default(""),
  landmark: z.string().trim().max(150).default(""),
  mapsUrl: z
    .string()
    .max(500)
    .default("")
    .refine(
      (v) =>
        !v ||
        /^https:\/\/(?:maps\.app\.goo\.gl\/|(?:www\.)?google\.com\/maps(?:\/|\?))/.test(
          v,
        ),
      "Use a Google Maps HTTPS link.",
    ),
  instructions: z.string().trim().max(500).default(""),
});
export const serviceSelectionSchema = z.object({
  delivery: serviceAddressSchema.nullable().default(null),
  collection: serviceAddressSchema.nullable().default(null),
});
export type ServiceSelection = z.infer<typeof serviceSelectionSchema>;
export type ServiceConfig = {
  enabled: boolean;
  delivery_open: string;
  delivery_close: string;
  collection_open: string;
  collection_close: string;
  cash_enabled: boolean;
  qrph_enabled: boolean;
  qrph_ready: boolean;
  areas: {
    id: string;
    name: string;
    delivery_php: number;
    collection_php: number;
  }[];
};
export const selfService: ServiceSelection = {
  delivery: null,
  collection: null,
};
export type ServiceQuote = {
  deliveryFeeCentavos: number;
  collectionFeeCentavos: number;
  totalCentavos: number;
  delivery?: unknown;
  collection?: unknown;
};
