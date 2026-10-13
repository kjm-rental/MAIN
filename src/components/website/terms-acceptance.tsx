"use client";
import Link from "next/link";
import {
  CURRENT_TERMS_URL,
  CURRENT_TERMS_VERSION,
} from "@/lib/terms-acceptance-policy";

export function TermsAcceptance({
  acceptedVersion,
  onChange,
}: {
  acceptedVersion: string | null;
  onChange: (version: string | null) => void;
}) {
  return (
    <div className="mt-5">
      <label
        className="text-muted flex gap-3 text-sm leading-6"
        htmlFor="rental-terms-acceptance"
      >
        <input
          id="rental-terms-acceptance"
          name="termsAcceptance"
          type="checkbox"
          required
          checked={acceptedVersion === CURRENT_TERMS_VERSION}
          onChange={(event) =>
            onChange(event.target.checked ? CURRENT_TERMS_VERSION : null)
          }
          className="accent-ocean mt-1 size-4 shrink-0"
        />
        <span>
          I have read and agree to KJM Motorcycle Rental&apos;s Terms and
          Conditions.
        </span>
      </label>
      <p className="text-muted mt-2 text-xs leading-5">
        <Link
          href={CURRENT_TERMS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-ocean font-bold underline underline-offset-4"
        >
          Read the complete Terms and Conditions (opens in a new tab)
        </Link>{" "}
        · Version {CURRENT_TERMS_VERSION}
      </p>
    </div>
  );
}
