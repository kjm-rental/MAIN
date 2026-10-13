/* eslint-disable @typescript-eslint/no-require-imports -- Disposable-only transaction harness. */
const fs = require("node:fs"),
  path = require("node:path");
const { Client } = require("/tmp/kjm-phase6-node/node_modules/pg");
const meta = "/tmp/kjm-phase6-supabase.bwb60x/supabase/.temp";
const ref = fs.readFileSync(path.join(meta, "project-ref"), "utf8").trim();
const url = new URL(
  fs.readFileSync(path.join(meta, "pooler-url"), "utf8").trim(),
);
if (
  ref !== "uuxjymzrtncrnnkvdpjy" ||
  !decodeURIComponent(url.username).includes(ref) ||
  url.toString().includes("slevojynuumrvgiznmxk")
)
  throw Error("Disposable target required");
url.password = fs
  .readFileSync("/tmp/kjm-phase6-test-db-password", "utf8")
  .trim();
const c = new Client({
  connectionString: url.toString(),
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});
(async () => {
  try {
    await c.connect();
    await c.query("begin");
    await c.query("set local statement_timeout='15s'");
    await c.query(
      fs.readFileSync(
        path.resolve(
          __dirname,
          "../../supabase/migrations/202610110020_cash_deposits_and_rental_operations.sql",
        ),
        "utf8",
      ),
    );
    console.log("Migration 020 transaction dry run passed");
    await c.query("rollback");
  } catch (e) {
    console.error(
      JSON.stringify({
        code: e.code,
        message: e.message,
        position: e.position,
      }),
    );
    await c.query("rollback").catch(() => {});
    process.exitCode = 1;
  } finally {
    await c.end();
  }
})();
