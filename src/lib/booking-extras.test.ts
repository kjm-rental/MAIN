import { expect, it } from "vitest";
import { extraFitsMotorcycle, extraQuantityLimit } from "./booking-extras";
const extra = { name: "Helmet", max_per_booking: 10, total_quantity: 20 };
it.each(["Helmet", "Helmets", "Raincoat", "raincoats"])(
  "limits %s to two while respecting stock and catalog limits",
  (name) => {
    expect(extraQuantityLimit({ ...extra, name })).toBe(2);
    expect(extraQuantityLimit({ ...extra, name, total_quantity: 1 })).toBe(1);
    expect(extraQuantityLimit({ ...extra, name, max_per_booking: 1 })).toBe(1);
    expect(extraQuantityLimit({ ...extra, name, total_quantity: 0 })).toBe(0);
  },
);
it.each(["Top Box", "Top-box", "Top_box", "Topbox"])(
  "hides an unconfigured %s and only allows configured models",
  (name) => {
    expect(extraFitsMotorcycle({ ...extra, name }, "model-a")).toBe(false);
    expect(
      extraFitsMotorcycle(
        {
          ...extra,
          name,
          compatible_model_ids: ["model-a"],
          compatible_unit_ids: ["unit-a"],
        },
        "model-a",
      ),
    ).toBe(true);
    expect(
      extraFitsMotorcycle(
        {
          ...extra,
          name,
          compatible_model_ids: ["model-a"],
          compatible_unit_ids: ["unit-a"],
        },
        "model-b",
      ),
    ).toBe(false);
    expect(extraQuantityLimit({ ...extra, name })).toBe(1);
  },
);
it("keeps ordinary extras unrestricted unless compatibility is configured", () => {
  expect(extraFitsMotorcycle(extra, "model-b")).toBe(true);
  expect(
    extraFitsMotorcycle(
      {
        ...extra,
        compatible_model_ids: ["model-a"],
        compatible_unit_ids: ["unit-a"],
      },
      "model-b",
    ),
  ).toBe(false);
});
