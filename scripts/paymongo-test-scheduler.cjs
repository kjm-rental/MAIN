/* eslint-disable @typescript-eslint/no-require-imports -- Local Node scheduler. */
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { load, root } = require("./paymongo-test-env.cjs");
load(); // Refuse production credentials before starting.
const marker = path.join(root, ".paymongo-tools", "scheduler.pid");
fs.mkdirSync(path.dirname(marker), { recursive: true, mode: 0o700 });
if (fs.existsSync(marker)) {
  const pid = Number(fs.readFileSync(marker, "utf8"));
  try { process.kill(pid, 0); console.error("Local scheduler already running"); process.exit(1); }
  catch (error) { if (error.code !== "ESRCH") throw error; }
}
fs.writeFileSync(marker, String(process.pid), { mode: 0o600 });
let child;
function run() {
  if (child) return;
  child = spawn(process.execPath, [path.join(root, "scripts/paymongo-test.cjs"), "reconcile"], { cwd: root, stdio: "inherit" });
  child.on("exit", code => { child = null; if (code) console.error("Reconciliation requires review; no automatic payment success assumed"); });
  child.on("error", () => { child = null; console.error("Reconciliation could not start"); });
}
const timer = setInterval(run, 300000);
function stop() {
  clearInterval(timer);
  if (child) child.kill("SIGTERM");
  fs.rmSync(marker, { force: true });
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
console.log("Isolated TEST reconciliation runs every 5 minutes while this process remains open.");
run();
