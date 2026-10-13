export const CURRENT_TERMS_VERSION = "2026-10-12";
export const CURRENT_TERMS_URL = `/terms/${CURRENT_TERMS_VERSION}`;

export function hasRequiredBookingAcceptance(
  declaration: boolean,
  acceptedTermsVersion: string | null,
) {
  return declaration && acceptedTermsVersion === CURRENT_TERMS_VERSION;
}

export function assertBookingAcceptance(
  declaration: boolean,
  acceptedTermsVersion: string | null,
) {
  if (!hasRequiredBookingAcceptance(declaration, acceptedTermsVersion))
    throw new Error(
      "Accept the rental terms and required declaration before submitting.",
    );
}
