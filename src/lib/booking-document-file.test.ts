import { expect, it } from "vitest";
import { documentFileError } from "./booking-document-file";
it("validates existing private upload types and 8MB limit", () => {
  expect(documentFileError({ type: "image/jpeg", size: 8_388_608 })).toBe("");
  expect(documentFileError({ type: "application/pdf", size: 50 })).toBe("");
  expect(documentFileError({ type: "image/jpeg", size: 8_388_609 })).toContain(
    "8 MB",
  );
  expect(documentFileError({ type: "text/html", size: 100 })).toContain(
    "image or PDF",
  );
  expect(documentFileError({ type: "image/png", size: 0 })).toContain("empty");
});
