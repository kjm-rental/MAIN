import { connection } from "next/server";

import { hasSupabasePublicConfig } from "@/lib/supabase/env";
import { createPublicCatalogClient } from "@/lib/supabase/public-catalog";
import type { MotorcycleModel } from "@/types/motorcycle";
import testPublicCatalogSlugs from "@/lib/constants/test-public-catalog.json";

type CatalogRow = Readonly<{
  id?: string;
  is_published: boolean;
  archived_at: string | null;
  slug: string;
  brand: string;
  display_name: string;
  daily_rate_php: number;
  description: string | null;
  generation: string | null;
  exact_model_name: string | null;
  model_year: string | null;
  engine_cc: number | null;
  transmission: string | null;
  fuel_tank_capacity_liters: number | null;
  cooling_system: string | null;
  starting_system: string | null;
  braking_system: string | null;
  category: string | null;
  notable_features: unknown;
  specification_status: string;
  specification_note: string;
  specification_source_url: string | null;
}>;

type MediaRow = Readonly<{
  motorcycle_model_id: string;
  storage_path: string;
  alt_text: string;
  sort_order: number;
  is_primary: boolean;
  license_status: string;
  license_source_url: string | null;
  license_note: string | null;
  verification_status: string;
}>;

export type PublicCatalogResult = Readonly<{
  motorcycles: readonly MotorcycleModel[];
  source: "supabase" | "error" | "unconfigured";
  notice: string;
}>;

type PackageRateRow = Readonly<{
  motorcycle_model_id: string;
  pricing_type: string;
  amount_php: number;
  is_active: boolean;
  valid_from: string | null;
  valid_until: string | null;
}>;

async function fetchPackageRates(
  modelIds: string[],
): Promise<readonly PackageRateRow[]> {
  if (!modelIds.length) return [];
  const { data, error } = await createPublicCatalogClient().rpc(
    "get_public_package_rates",
    { p_model_ids: modelIds },
  );
  if (error) throw new Error(`Catalog rates query failed: ${error.message}`);
  return data ?? [];
}

type CatalogDependencies = Readonly<{
  isConfigured?: boolean;
  fetchRows?: () => Promise<readonly CatalogRow[]>;
  fetchRateRows?: () => Promise<readonly PackageRateRow[]>;
  fetchMediaRows?: () => Promise<readonly MediaRow[]>;
  resolveStorageUrl?: (storagePath: string) => string;
}>;

async function fetchPublishedRows(): Promise<readonly CatalogRow[]> {
  const supabase = createPublicCatalogClient();
  const { data, error } = await supabase
    .from("motorcycle_models")
    .select(
      "id, is_published, archived_at, slug, brand, display_name, daily_rate_php, description, generation, exact_model_name, model_year, engine_cc, transmission, fuel_tank_capacity_liters, cooling_system, starting_system, braking_system, category, notable_features, specification_status, specification_note, specification_source_url",
    )
    .eq("is_published", true)
    .is("archived_at", null)
    .order("daily_rate_php", { ascending: true });

  if (error) throw new Error(`Catalog query failed: ${error.message}`);
  return data;
}

async function fetchVerifiedMediaRows(
  modelIds: string[],
): Promise<readonly MediaRow[]> {
  if (!modelIds.length) return [];
  const supabase = createPublicCatalogClient();
  const { data, error } = await supabase
    .from("motorcycle_media")
    .select(
      "motorcycle_model_id, storage_path, alt_text, sort_order, is_primary, license_status, license_source_url, license_note, verification_status",
    )
    .in("motorcycle_model_id", modelIds)
    .eq("verification_status", "verified")
    .in("license_status", ["business_owned", "licensed", "permission_granted"])
    .not("license_source_url", "is", null)
    .not("license_note", "is", null)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`Catalog media query failed: ${error.message}`);
  return data;
}

export async function getPublicMotorcycleCatalog(
  dependencies: CatalogDependencies = {},
): Promise<PublicCatalogResult> {
  const isConfigured = dependencies.isConfigured ?? hasSupabasePublicConfig();

  if (!isConfigured) {
    return {
      motorcycles: [],
      source: "unconfigured",
      notice:
        "Motorcycle catalog is unavailable because the data service is not configured.",
    };
  }

  // Supabase is the live source of truth. Opt into request-time rendering
  // before the error boundary so Next.js control-flow errors are not mistaken
  // for data-service failures and admin catalog changes are immediately visible.
  if (!dependencies.fetchRows) await connection();

  try {
    const rows = (
      await (dependencies.fetchRows ?? fetchPublishedRows)()
    ).filter(
      (row) =>
        row.is_published === true &&
        row.archived_at === null &&
        !/^synthetic(?:-|$)/i.test(row.slug) &&
        !/^synthetic\b/i.test(row.display_name) &&
        (process.env.KJM_PAYMONGO_TEST !== "true" ||
          testPublicCatalogSlugs.includes(row.slug)),
    );
    const mediaRows = dependencies.fetchMediaRows
      ? await dependencies.fetchMediaRows()
      : dependencies.fetchRows
        ? []
        : await fetchVerifiedMediaRows(
            rows.flatMap((row) => (row.id ? [row.id] : [])),
          );
    // Package rates are optional: restricted/unavailable pricing must never hide models.
    let rateRows: readonly PackageRateRow[] = [];
    try {
      rateRows = dependencies.fetchRateRows
        ? await dependencies.fetchRateRows()
        : dependencies.fetchRows
          ? []
          : await fetchPackageRates(
              rows.flatMap((row) => (row.id ? [row.id] : [])),
            );
    } catch {
      // Keep the catalog available; unconfigured package prices display “Ask KJM”.
    }
    const now = Date.now();
    const packageRate = (id: string | undefined, type: string) => {
      const values = rateRows
        .filter(
          (rate) =>
            rate.motorcycle_model_id === id &&
            rate.pricing_type === type &&
            rate.is_active &&
            Number.isFinite(rate.amount_php) &&
            rate.amount_php >= 0 &&
            (!rate.valid_from || Date.parse(rate.valid_from) <= now) &&
            (!rate.valid_until || Date.parse(rate.valid_until) >= now),
        )
        .map((rate) => rate.amount_php);
      return values.length ? Math.min(...values) : undefined;
    };
    const supabase = dependencies.fetchRows
      ? null
      : createPublicCatalogClient();
    return {
      motorcycles: rows.map((row) => {
        const notableFeatures = Array.isArray(row.notable_features)
          ? row.notable_features.filter(
              (feature): feature is string => typeof feature === "string",
            )
          : [];
        const mappedMedia = mediaRows
          .filter(
            (item) =>
              item.motorcycle_model_id === row.id &&
              (process.env.KJM_PAYMONGO_TEST !== "true" ||
                item.storage_path.startsWith("main-public-sync/")),
          )
          .sort(
            (a, b) =>
              Number(b.is_primary) - Number(a.is_primary) ||
              a.sort_order - b.sort_order,
          )
          .flatMap((media) => {
            const storageUrl = dependencies.resolveStorageUrl
              ? dependencies.resolveStorageUrl(media.storage_path)
              : supabase
                ? supabase.storage
                    .from("motorcycle-catalog")
                    .getPublicUrl(media.storage_path).data.publicUrl
                : null;
            return storageUrl && media.license_source_url && media.license_note
              ? [
                  {
                    src: storageUrl,
                    alt: media.alt_text,
                    credit: media.license_note,
                    sourceUrl: media.license_source_url,
                    licenseName: "Approved catalog media",
                    licenseUrl: media.license_source_url,
                  },
                ]
              : [];
          });

        return {
          id: row.id,
          slug: row.slug,
          model: row.display_name,
          dailyRatePhp: row.daily_rate_php,
          weeklyRatePhp: packageRate(row.id, "weekly"),
          monthlyRatePhp: packageRate(row.id, "monthly"),
          description:
            row.description ??
            "Additional model information is pending confirmation.",
          specifications: {
            manufacturer: row.brand,
            exactModelName: row.exact_model_name ?? row.generation,
            modelYear: row.model_year,
            engineDisplacementCc: row.engine_cc,
            transmission: row.transmission,
            fuelTankCapacityLiters: row.fuel_tank_capacity_liters,
            coolingSystem: row.cooling_system,
            startingSystem: row.starting_system,
            brakingSystem: row.braking_system,
            category: row.category,
            notableFeatures,
            verificationStatus: isVerificationStatus(row.specification_status)
              ? row.specification_status
              : "pending",
            verificationNote: row.specification_note,
            sourceUrl: row.specification_source_url,
          },
          primaryImage: mappedMedia[0],
          galleryImages: mappedMedia,
        };
      }),
      source: "supabase",
      notice:
        "Published catalog data from Supabase. Physical-unit availability is not connected.",
    };
  } catch {
    return {
      motorcycles: [],
      source: "error",
      notice:
        "We could not load the motorcycle catalog. Please try again soon.",
    };
  }
}

function isVerificationStatus(
  value: string,
): value is "verified" | "reference_only" | "pending" {
  return ["verified", "reference_only", "pending"].includes(value);
}
