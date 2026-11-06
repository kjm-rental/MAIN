import fs from "node:fs";
(async () => {
  const results = [];
  for (const url of [
    "https://kjmride.com/",
    "https://kjmride.com/motorcycles",
    "https://kjmride.com/book/honda-click-125cc",
    "https://kjmride.com/api/delivery/options",
    "https://kjmadmin.vercel.app/sign-in",
  ]) {
    const samples = [];
    for (let i = 0; i < 3; i++) {
      const start = performance.now(),
        r = await fetch(url),
        firstByteMs = Math.round(performance.now() - start);
      await r.arrayBuffer();
      samples.push({
        status: r.status,
        firstByteMs,
        totalMs: Math.round(performance.now() - start),
        region: r.headers
          .get("x-vercel-id")
          ?.split("::")
          .slice(0, -1)
          .join("::"),
      });
    }
    const ordered = samples.map((s) => s.totalMs).sort((a, b) => a - b);
    results.push({ url, medianTotalMs: ordered[1], samples });
    console.log(JSON.stringify(results.at(-1)));
  }
  if (process.argv[2])
    fs.writeFileSync(process.argv[2], JSON.stringify(results, null, 2));
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
