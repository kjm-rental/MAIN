/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS environment launcher; no transpiler required. */
const fs = require("node:fs");
const path = require("node:path");
const { parseEnv } = require("node:util");

const ref = "uuxjymzrtncrnnkvdpjy";
const testURL = `https://${ref}.supabase.co`;
const root = path.resolve(__dirname, "..");
const filename = path.join(root, ".env.paymongo-test.local");
function jwtMatches(key, role) {
  try {
    const claims = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString());
    return claims.ref === ref && claims.role === role;
  } catch { return false; }
}
function load() {
  if (!fs.existsSync(filename)) throw new Error("Missing isolated test environment file");
  const env = parseEnv(fs.readFileSync(filename, "utf8"));
  if (env.NEXT_PUBLIC_SUPABASE_URL !== testURL || env.PAYMONGO_TEST_PROJECT_REF !== ref ||
      !jwtMatches(env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "anon") ||
      !jwtMatches(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, "anon") ||
      !jwtMatches(env.SUPABASE_SERVICE_ROLE_KEY, "service_role") ||
      !env.PAYMONGO_SECRET_KEY?.startsWith("sk_test_"))
    throw new Error("Test project/key validation failed; production environment was not loaded");
  if (!["false", "true"].includes(env.PAYMONGO_TEST_ENABLED) || env.PAYMONGO_MODE === "live")
    throw new Error("Explicit TEST mode and test creation flag required");
  if (env.PAYMONGO_TEST_ENABLED === "true" && (!env.PAYMONGO_APP_ORIGIN || !env.PAYMONGO_WEBHOOK_SECRET || !env.PAYMONGO_RECONCILIATION_SECRET))
    throw new Error("Complete TEST webhook/reconciliation configuration required");
  if (env.PAYMONGO_APP_ORIGIN) {
    const u = new URL(env.PAYMONGO_APP_ORIGIN);
    if (u.protocol !== "https:" || u.origin !== env.PAYMONGO_APP_ORIGIN || u.username || u.password)
      throw new Error("Test origin must be an exact HTTPS origin without a trailing slash");
  }
  return env;
}
module.exports = { load, filename, root, ref, testURL, jwtMatches };
