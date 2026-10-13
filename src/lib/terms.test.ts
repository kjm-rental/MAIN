import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assertBookingAcceptance,
  CURRENT_TERMS_URL,
  CURRENT_TERMS_VERSION,
  currentTerms,
  hasRequiredBookingAcceptance,
  termsVersions,
} from "./terms";

describe("official rental agreement integrity", () => {
  it("preserves the owner's complete source and all clause/list text in order", () => {
    const source = readFileSync(
      "public/legal/kjm-terms-2026-10-12.txt",
      "utf8",
    );
    expect(currentTerms.sourceText).toBe(source);
    expect(createHash("sha256").update(source).digest("hex")).toBe(
      "c3b67ee46b4d490fee7d638b94d5ff9ce560150c513f0ec239901cdd942e8c74",
    );
    expect(currentTerms.sourceSha256).toBe(
      createHash("sha256").update(source).digest("hex"),
    );
    const rebuilt = [
      currentTerms.title,
      currentTerms.subtitle,
      `Effective Date: ${currentTerms.effectiveDate}`,
      currentTerms.intro,
      ...currentTerms.sections.flatMap((section) => [
        `${section.number}. ${section.title}`,
        ...section.blocks.map(
          (block) => `${block.kind === "bullet" ? "* " : ""}${block.text}`,
        ),
      ]),
    ];
    expect(rebuilt.join("\n").replace(/\s+/g, " ").trim()).toBe(
      source.replace(/\s+/g, " ").trim(),
    );
    expect(currentTerms.sections.map((section) => section.number)).toEqual(
      Array.from({ length: 28 }, (_, i) => i + 1),
    );
    expect(
      currentTerms.sections[20].blocks.filter(
        (block) => block.kind === "bullet",
      ),
    ).toHaveLength(7);
  });
  it("keeps a stable version and a resolvable archived agreement", () => {
    expect(CURRENT_TERMS_VERSION).toBe("2026-10-12");
    expect(termsVersions[CURRENT_TERMS_VERSION]).toBe(currentTerms);
    expect(CURRENT_TERMS_URL).toBe("/terms/2026-10-12");
  });
});

describe("booking rental terms acceptance", () => {
  it.each([
    [false, null, false],
    [true, null, false],
    [false, CURRENT_TERMS_VERSION, false],
    [true, "2026-10-11", false],
    [true, "", false],
    [true, CURRENT_TERMS_VERSION, true],
  ])(
    "requires both declaration %s and the current agreement %s",
    (declaration, version, allowed) => {
      expect(hasRequiredBookingAcceptance(declaration, version)).toBe(allowed);
      if (allowed)
        expect(() =>
          assertBookingAcceptance(declaration, version),
        ).not.toThrow();
      else
        expect(() => assertBookingAcceptance(declaration, version)).toThrow(
          "Accept the rental terms",
        );
    },
  );
  it("gates checkout before auth/submission while keeping the deposit RPC version separate", () => {
    const checkout = readFileSync(
      "src/components/website/booking-checkout.tsx",
      "utf8",
    );
    const submit = checkout.slice(
      checkout.indexOf("async function submit()"),
      checkout.indexOf("if (!configured)"),
    );
    expect(
      submit.indexOf(
        "assertBookingAcceptance(consented, acceptedTermsVersion)",
      ),
    ).toBeLessThan(submit.indexOf("auth.getUser()"));
    expect(submit).toContain('rpc("submit_booking_request_v3"');
    expect(submit).toContain("p_policy_version: quote.policy_version");
    expect(checkout).toMatch(
      /!hasRequiredBookingAcceptance\(\s*consented,\s*acceptedTermsVersion,?\s*\)/,
    );
  });
});
