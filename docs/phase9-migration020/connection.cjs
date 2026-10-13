/* eslint-disable @typescript-eslint/no-require-imports */
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
function client() {
  return new Client({
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });
}
module.exports = { client, ref };
