import { z } from "zod";

const point = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});
export const signatureStrokesSchema = z
  .array(z.array(point).min(2).max(2000))
  .min(1)
  .max(100)
  .refine(
    (strokes) =>
      strokes.reduce((count, stroke) => count + stroke.length, 0) <= 10000,
    "Signature is too large; please clear and sign again.",
  )
  .refine(
    (strokes) =>
      strokes.some((stroke) =>
        stroke.some(
          (p) => Math.hypot(p.x - stroke[0].x, p.y - stroke[0].y) > 0.02,
        ),
      ),
    "Please draw your signature.",
  );
export type SignatureStrokes = z.infer<typeof signatureStrokesSchema>;
