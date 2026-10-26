import { expect, it } from "vitest";
import { documentNamesMatch } from "./document-name-match";
it.each([
  ["Maria Ana Santos", "SANTOS, Maria Ana"],
  ["Mary-Jane O’Neil", "O'Neil Mary Jane"],
  ["Juan  de la Cruz", "CRUZ, JUAN DE LA"],
])("accepts only harmless full-token differences: %s", (a, b) =>
  expect(documentNamesMatch(a, b)).toBe(true),
);
it.each([
  ["Maria Ana Santos", "Maria Santos"],
  ["John Smith", "James Smith"],
  ["John A Smith", "John Andrew Smith"],
  ["Ana Ana Cruz", "Ana Cruz Cruz"],
  ["José Cruz", "Jose Cruz"],
  ["John A Smith", "John A Smith"],
])("routes significant or uncertain differences to review: %s", (a, b) =>
  expect(documentNamesMatch(a, b)).toBe(false),
);
