import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ admin: false, calls: [] as unknown[][] }));
const rows = [
  {
    id: "183e8f6d-5a40-423b-b7e2-51589b548b4d",
    slug: "yamaha-mio-gravis-125-d1342cb8",
    display_name: "Yamaha Mio Gravis 125cc",
    daily_rate_php: 550,
    is_published: true,
    archived_at: null,
  },
  {
    id: "seed",
    slug: "yamaha-mio-gravis-125cc",
    display_name: "Archived Yamaha",
    daily_rate_php: 550,
    is_published: false,
    archived_at: "2026-10-09",
  },
  {
    id: "draft",
    slug: "draft-model",
    display_name: "Draft",
    daily_rate_php: 499,
    is_published: false,
    archived_at: null,
  },
  {
    id: "archived-published",
    slug: "archived-published",
    display_name: "Archived Published",
    daily_rate_php: 599,
    is_published: true,
    archived_at: "2026-10-09",
  },
  {
    id: "synthetic",
    slug: "synthetic-readiness-fixture",
    display_name: "Synthetic Readiness Test",
    daily_rate_php: 250,
    is_published: true,
    archived_at: null,
  },
];
vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("@/lib/supabase/env", () => ({ hasSupabasePublicConfig: () => true }));
vi.mock("@/lib/supabase/public-catalog", () => ({
  createPublicCatalogClient: () => ({
    from: (table: string) => {
      let data =
        table === "motorcycle_models"
          ? rows.filter(
              (r) => state.admin || (r.is_published && r.archived_at === null),
            )
          : [];
      const chain = {
        select: () => chain,
        eq: (field: string, value: unknown) => {
          state.calls.push(["eq", table, field, value]);
          data = data.filter((r) => r[field as keyof typeof r] === value);
          return chain;
        },
        is: (field: string, value: unknown) => {
          state.calls.push(["is", table, field, value]);
          data = data.filter((r) => r[field as keyof typeof r] === value);
          return chain;
        },
        in: (field: string, value: unknown) => {
          state.calls.push(["in", table, field, value]);
          return chain;
        },
        not: () => chain,
        order: async () => ({ data, error: null }),
      };
      return chain;
    },
    storage: {
      from: () => ({
        getPublicUrl: () => ({
          data: { publicUrl: "https://example.invalid/image" },
        }),
      }),
    },
  }),
}));
import { getPublicMotorcycleCatalog } from "./public-catalog";
describe("public catalog visibility across sessions", () => {
  it("fails closed if a row source returns drafts or archived models", async () => {
    const result = await getPublicMotorcycleCatalog({
      isConfigured: true,
      fetchRows: vi.fn().mockResolvedValue(rows),
    });
    expect(result.motorcycles.map((model) => model.id)).toEqual([rows[0].id]);
  });
  beforeEach(() => {
    state.calls = [];
    state.admin = false;
  });
  for (const session of ["anonymous", "customer", "tester", "administrator"])
    it(`${session} receives only published unarchived models`, async () => {
      state.admin = session === "administrator";
      const r = await getPublicMotorcycleCatalog();
      expect(r.motorcycles.map((m) => m.id)).toEqual([rows[0].id]);
      expect(r.motorcycles[0].dailyRatePhp).toBe(550);
      expect(state.calls).toContainEqual([
        "eq",
        "motorcycle_models",
        "is_published",
        true,
      ]);
      expect(state.calls).toContainEqual([
        "is",
        "motorcycle_models",
        "archived_at",
        null,
      ]);
      expect(state.calls).toContainEqual([
        "in",
        "motorcycle_media",
        "motorcycle_model_id",
        [rows[0].id],
      ]);
    });
  it("detail and booking slug lookups cannot resolve hidden records even for administrators", async () => {
    state.admin = true;
    const r = await getPublicMotorcycleCatalog();
    for (const row of rows.slice(1))
      expect(r.motorcycles.find((m) => m.slug === row.slug)).toBeUndefined();
    expect(r.motorcycles.find((m) => m.slug === rows[0].slug)).toBeDefined();
  });
  it("isolated test storefront hides published synthetic fixtures without deleting them", async () => {
    vi.stubEnv("KJM_PAYMONGO_TEST", "true");
    rows.push({
      ...rows[0],
      id: "synthetic",
      slug: "synthetic-p9-concurrency-fixture",
    });
    try {
      const result = await getPublicMotorcycleCatalog();
      expect(result.motorcycles.map((model) => model.slug)).toEqual([
        rows[0].slug,
      ]);
      expect(rows.some((row) => row.id === "synthetic")).toBe(true);
    } finally {
      rows.pop();
      vi.unstubAllEnvs();
    }
  });
});
