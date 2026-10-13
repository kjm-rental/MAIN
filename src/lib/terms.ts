import terms20261012 from "@/lib/content/terms/2026-10-12.json";
import { CURRENT_TERMS_VERSION } from "./terms-acceptance-policy";

// Published versions are immutable. Add a new file/version for amendments.
export const termsVersions = { "2026-10-12": terms20261012 } as const;
export {
  CURRENT_TERMS_VERSION,
  CURRENT_TERMS_URL,
  assertBookingAcceptance,
  hasRequiredBookingAcceptance,
} from "./terms-acceptance-policy";
export const currentTerms = termsVersions[CURRENT_TERMS_VERSION];
