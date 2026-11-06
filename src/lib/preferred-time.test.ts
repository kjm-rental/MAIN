import { expect, it } from "vitest";
import { preferredTime24, preferredTimeParts } from "./preferred-time";
it.each([
  ["12", "00", "AM", "00:00"],
  ["12", "00", "PM", "12:00"],
  ["7", "25", "PM", "19:25"],
  ["2", "17", "AM", "02:17"],
  ["11", "59", "PM", "23:59"],
] as const)("converts %s:%s %s exactly", (h, m, p, result) => {
  expect(preferredTime24(h, m, p)).toBe(result);
  expect(
    preferredTime24(
      ...(Object.values(preferredTimeParts(result)) as [
        string,
        string,
        "AM" | "PM",
      ]),
    ),
  ).toBe(result);
});
it.each([
  ["", "17"],
  ["0", "00"],
  ["13", "00"],
  ["02", "60"],
  ["02", ""],
])("rejects incomplete or invalid %s:%s", (h, m) =>
  expect(preferredTime24(h, m, "AM")).toBe(""),
);
