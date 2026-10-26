import { describe, expect, it, vi } from "vitest";

import { getPublicMotorcycleCatalog } from "@/services/public-catalog";

describe("getPublicMotorcycleCatalog", () => {
  it("fails closed when Supabase is not configured", async () => {
    const result = await getPublicMotorcycleCatalog({ isConfigured: false });
    expect(result.source).toBe("unconfigured");
    expect(result.motorcycles).toEqual([]);
    expect(result.notice).toContain("not configured");
  });

  it("maps only rows returned by the public catalog query", async () => {
    const fetchRows = vi.fn().mockResolvedValue([
      {
        slug: "honda-beat",
        is_published: true,
        archived_at: null,
        display_name: "Honda Beat",
        daily_rate_php: 499,
      },
    ]);
    const result = await getPublicMotorcycleCatalog({
      isConfigured: true,
      fetchRows,
    });
    expect(fetchRows).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      source: "supabase",
      motorcycles: [
        { slug: "honda-beat", model: "Honda Beat", dailyRatePhp: 499 },
      ],
    });
  });

  it("preserves a valid live empty state", async () => {
    const result = await getPublicMotorcycleCatalog({
      isConfigured: true,
      fetchRows: async () => [],
    });
    expect(result.source).toBe("supabase");
    expect(result.motorcycles).toEqual([]);
    expect(result.notice).not.toContain("not configured");
    expect(result.notice).not.toContain("could not load");
  });

  it("prefers a verified licensed Supabase media record over local fallback", async () => {
    const result = await getPublicMotorcycleCatalog({
      isConfigured: true,
      fetchRows: async () => [
        {
          id: "model-id",
          is_published: true,
          slug: "honda-beat",
          brand: "Honda",
          display_name: "Honda Beat",
          daily_rate_php: 499,
          description: "Published description",
          generation: null,
          exact_model_name: "BeAT",
          model_year: null,
          engine_cc: 110,
          transmission: "Automatic",
          fuel_tank_capacity_liters: null,
          cooling_system: "Air-cooled",
          starting_system: "Electric",
          braking_system: null,
          category: "Scooter",
          notable_features: [],
          specification_status: "verified",
          specification_note: "Verified note",
          specification_source_url: "https://example.com/specs",
          archived_at: null,
        },
      ],
      fetchMediaRows: async () => [
        {
          motorcycle_model_id: "model-id",
          storage_path: "honda-beat/main.webp",
          alt_text: "Approved Honda BeAT reference photograph",
          sort_order: 0,
          is_primary: true,
          license_status: "permission_granted",
          license_source_url: "https://example.com/permission",
          license_note: "Photo used with permission",
          verification_status: "verified",
        },
      ],
      resolveStorageUrl: (path) => `https://project.supabase.co/${path}`,
    });

    expect(result.motorcycles[0]?.primaryImage).toMatchObject({
      src: "https://project.supabase.co/honda-beat/main.webp",
      alt: "Approved Honda BeAT reference photograph",
    });
  });

  it("fails closed when the live query fails", async () => {
    const result = await getPublicMotorcycleCatalog({
      isConfigured: true,
      fetchRows: async () => {
        throw new Error("network unavailable");
      },
    });
    expect(result.source).toBe("error");
    expect(result.motorcycles).toEqual([]);
    expect(result.notice).toContain("could not load");
  });
});

it("shows current saved weekly and monthly rates without deriving or inventing package prices", async () => {
  const result = await getPublicMotorcycleCatalog({
    isConfigured: true,
    fetchRows: vi.fn().mockResolvedValue([
      {
        id: "model-1",
        slug: "suzuki-v-strom-160",
        is_published: true,
        archived_at: null,
        display_name: "Suzuki V-Strom 160",
        daily_rate_php: 850,
      },
    ]),
    fetchRateRows: vi.fn().mockResolvedValue([
      {
        motorcycle_model_id: "model-1",
        pricing_type: "weekly",
        amount_php: 5000,
        is_active: true,
        valid_from: null,
        valid_until: null,
      },
      {
        motorcycle_model_id: "model-1",
        pricing_type: "monthly",
        amount_php: 18000,
        is_active: true,
        valid_from: null,
        valid_until: null,
      },
      {
        motorcycle_model_id: "model-1",
        pricing_type: "weekly",
        amount_php: 1,
        is_active: false,
        valid_from: null,
        valid_until: null,
      },
      {
        motorcycle_model_id: "model-1",
        pricing_type: "monthly",
        amount_php: 2,
        is_active: true,
        valid_from: null,
        valid_until: "2020-01-01T00:00:00Z",
      },
    ]),
  });
  expect(result.motorcycles[0]).toMatchObject({
    dailyRatePhp: 850,
    weeklyRatePhp: 5000,
    monthlyRatePhp: 18000,
  });
});

it("keeps motorcycles visible when optional public package rates cannot load", async () => {
  const result = await getPublicMotorcycleCatalog({
    isConfigured: true,
    fetchRows: vi
      .fn()
      .mockResolvedValue([
        {
          id: "model",
          slug: "suzuki-v-strom-160",
          display_name: "Suzuki V-Strom 160",
          daily_rate_php: 850,
          is_published: true,
          archived_at: null,
        },
      ]),
    fetchRateRows: vi
      .fn()
      .mockRejectedValue(
        new Error("permission denied for table pricing_rules"),
      ),
  });
  expect(result.source).toBe("supabase");
  expect(result.motorcycles).toHaveLength(1);
  expect(result.motorcycles[0].dailyRatePhp).toBe(850);
  expect(result.motorcycles[0].weeklyRatePhp).toBeUndefined();
});
