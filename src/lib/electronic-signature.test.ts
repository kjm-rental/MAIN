import { describe, expect, it } from "vitest";
import { signatureStrokesSchema } from "./electronic-signature";
const stroke = [
  { x: 0.1, y: 0.2 },
  { x: 0.6, y: 0.8 },
];
describe("drawn electronic signatures", () => {
  it("accepts normalized multi-stroke signatures", () => {
    expect(signatureStrokesSchema.safeParse([stroke, stroke]).success).toBe(
      true,
    );
  });
  it.each(
    [
      [],
      [[{ x: 0.2, y: 0.2 }]],
      [
        [
          { x: 0.2, y: 0.2 },
          { x: 0.2, y: 0.2 },
        ],
      ],
      [
        [
          { x: -1, y: 0 },
          { x: 1, y: 1 },
        ],
      ],
      [
        [
          { x: NaN, y: 0 },
          { x: 1, y: 1 },
        ],
      ],
    ].map((drawing) => ({ drawing })),
  )("rejects blank or malformed drawings $drawing", ({ drawing }) => {
    expect(signatureStrokesSchema.safeParse(drawing).success).toBe(false);
  });
  it("limits the saved drawing size", () => {
    expect(
      signatureStrokesSchema.safeParse(
        Array.from({ length: 6 }, () =>
          Array.from({ length: 2000 }, (_, i) => stroke[i % 2]),
        ),
      ).success,
    ).toBe(false);
  });
});
