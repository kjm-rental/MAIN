/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process");
(async () => {
  const reports = [];
  for (const project of ["uuxjymzrtncrnnkvdpjy", "slevojynuumrvgiznmxk"]) {
    const proc = spawnSync(
      process.execPath,
      [
        path.resolve(__dirname, "../../node_modules/supabase/dist/supabase.js"),
        "projects",
        "api-keys",
        "--project-ref",
        project,
        "--output",
        "json",
      ],
      { encoding: "utf8", timeout: 20000 },
    );
    if (proc.status !== 0) {
      reports.push({
        project,
        verified: false,
        reason: "Read-only CLI credential lookup unavailable",
      });
      continue;
    }
    const keys = JSON.parse(proc.stdout),
      anon = keys.find((k) => k.name === "anon")?.api_key,
      service = keys.find((k) => k.name === "service_role")?.api_key;
    if (!anon) {
      reports.push({
        project,
        verified: false,
        reason: "Anonymous API key unavailable",
      });
      continue;
    }
    const r = await fetch(`https://${project}.supabase.co/auth/v1/settings`, {
        headers: { apikey: anon },
      }),
      data = await r.json();
    let publicBooking = null,
      notificationSchemaAbsent = null,
      workerRpcAbsent = null;
    if (service) {
      const b = await fetch(
        `https://${project}.supabase.co/rest/v1/booking_settings?select=public_booking_enabled`,
        { headers: { apikey: service, Authorization: `Bearer ${service}` } },
      );
      if (b.ok)
        publicBooking = (await b.json())[0]?.public_booking_enabled ?? null;
      const n = await fetch(
        `https://${project}.supabase.co/rest/v1/notification_settings?select=id`,
        { headers: { apikey: service, Authorization: `Bearer ${service}` } },
      );
      const nj = await n.json();
      notificationSchemaAbsent = n.status === 404 && nj.code === "PGRST205";
      const schema = await fetch(`https://${project}.supabase.co/rest/v1/`, {
        headers: {
          apikey: service,
          Authorization: `Bearer ${service}`,
          Accept: "application/openapi+json",
        },
      });
      if (schema.ok) {
        const openapi = await schema.json();
        workerRpcAbsent = !openapi.paths?.["/rpc/notification_claim"];
      }
    }
    reports.push({
      project,
      readOnly: true,
      authHttp: r.status,
      anonymousAuthEnabled: data.external?.anonymous_users ?? null,
      publicBookingEnabled: publicBooking,
      notificationSchemaAbsent,
      workerRpcAbsent,
      noCredentialsPersisted: true,
    });
  }
  fs.writeFileSync(
    path.join(__dirname, "remote-auth-settings.json"),
    JSON.stringify(reports, null, 2),
  );
  console.log(JSON.stringify(reports, null, 2));
})().catch((e) => {
  console.error("Read-only Auth verification failed: " + e.name);
  process.exitCode = 1;
});
