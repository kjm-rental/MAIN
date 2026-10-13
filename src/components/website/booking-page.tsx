import {
  depositOptionsSchema,
  isMissingDepositSchema,
} from "@/lib/security-deposits";
import { notFound } from "next/navigation";
import { BookingCheckout } from "@/components/website/booking-checkout";
import { Container } from "@/components/ui/container";
import { createClient } from "@/lib/supabase/server";
import { getPublicMotorcycleCatalog } from "@/services/public-catalog";
import testPublicExtraIds from "@/lib/constants/test-public-extras.json";

export async function BookingPage({ selectedSlug }: { selectedSlug?: string }) {
  const catalog = await getPublicMotorcycleCatalog();
  const motorcycle = selectedSlug
    ? catalog.motorcycles.find((m) => m.slug === selectedSlug)
    : catalog.motorcycles.find((m) => m.id);
  if (!motorcycle || !motorcycle.id) notFound();
  const supabase = await createClient();
  const [
    { data: settings, error: settingsError },
    { data: testingAllowed },
    { data: extras, error: extrasError },
    depositResult,
  ] = await Promise.all([
    supabase
      .from("booking_settings")
      .select(
        "timezone,operating_hours,partial_day_policy,partial_day_pricing_policy,pending_expiration_minutes,accepted_philippine_id_types,philippine_license_policy,international_license_policy,international_manual_review_required,international_policy_source_url,international_policy_verified_at,privacy_notice,public_booking_enabled,policies_approved_at",
      )
      .maybeSingle(),
    supabase.rpc("can_use_booking_testing"),
    supabase
      .from("booking_extras_catalog")
      .select(
        "id,name,description,price_php,price_centavos,pricing_model,total_quantity,max_per_booking,image_path",
      )
      .eq("is_active", true)
      .eq("is_available", true)
      .order("display_order")
      .order("name"),
    supabase.rpc("get_security_deposit_options"),
  ]);
  if (depositResult.error && !isMissingDepositSchema(depositResult.error))
    throw new Error("Security deposit options could not be loaded.");
  const depositOptions =
    depositResult.error || !depositResult.data
      ? null
      : depositOptionsSchema.parse(depositResult.data);
  const configured = Boolean(
    !settingsError &&
    Boolean(depositOptions?.cash_enabled || depositOptions?.id_enabled) &&
    ((settings?.public_booking_enabled && settings.policies_approved_at) ||
      testingAllowed) &&
    settings?.operating_hours &&
    settings.partial_day_policy &&
    settings.partial_day_pricing_policy &&
    settings.pending_expiration_minutes &&
    Array.isArray(settings.accepted_philippine_id_types) &&
    settings.accepted_philippine_id_types.length &&
    settings.philippine_license_policy &&
    settings.international_license_policy &&
    settings.international_manual_review_required &&
    settings.international_policy_source_url &&
    settings.international_policy_verified_at &&
    settings.privacy_notice,
  );
  return (
    <main className="booking-journey-page">
      <Container>
        <BookingCheckout
          depositOptions={depositOptions}
          preselected={Boolean(selectedSlug)}
          motorcycle={motorcycle}
          motorcycles={catalog.motorcycles}
          settings={settingsError ? null : settings}
          configured={configured}
          submissionEnabled={configured && process.env.KJM_LOCAL_BOOKING_DISABLED !== "true"}
          paymentTestMode={process.env.KJM_PAYMONGO_TEST === "true"}
          extras={extrasError ? [] : (extras ?? []).filter(extra =>
            process.env.KJM_PAYMONGO_TEST !== "true" || (testPublicExtraIds as string[]).includes(extra.id))}
        />
      </Container>
    </main>
  );
}
