type SupabasePublicConfig = Readonly<{
  url: string;
  apiKey: string;
}>;

export function hasSupabasePublicConfig(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
  );
}

export function getSupabasePublicConfig(): SupabasePublicConfig {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const apiKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !apiKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or a current publishable key).",
    );
  }

  return { url, apiKey };
}
