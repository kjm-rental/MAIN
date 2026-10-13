/* eslint-disable @typescript-eslint/no-require-imports -- Offline browser workflow; synthetic transport only. */
const fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http");
const esbuild = require("/tmp/kjm-phase8-preview/node_modules/esbuild");
const {
  chromium,
} = require("/tmp/kjm-phase7-browser.xAGrbn/node_modules/playwright");
const Axe =
  require("/tmp/kjm-phase7-browser.xAGrbn/node_modules/@axe-core/playwright").default;
const root = path.resolve(__dirname, "../..");
(async () => {
  const output = path.join(__dirname, "screenshots");
  fs.mkdirSync(output, { recursive: true });
  const code = `import React from 'react';import {createRoot} from 'react-dom/client';import {BookingCheckout} from '${root}/src/components/website/booking-checkout.tsx';const types=location.search.includes('id=1')?['Synthetic legally reviewed card']:[];const options={cash_enabled:true,cash_amount_centavos:12345,id_enabled:types.length>0,accepted_document_types:types,collection_instructions:'Synthetic collection policy',return_instructions:'Synthetic return policy',dispute_instructions:'Synthetic dispute policy',policy_version:'2026-10-11T00:00:00Z'};createRoot(document.getElementById('root')).render(<main style={{maxWidth:1200,margin:'auto',padding:16}}><p style={{background:'#fff4dc',color:'#624808',padding:12}}>OFFLINE SYNTHETIC CHECKOUT · No Supabase connection · Example amounts are not KJM policy</p><BookingCheckout motorcycle={{id:'synthetic-model',slug:'synthetic',model:'Synthetic motorcycle',dailyRatePhp:500,description:'',specifications:{}}} configured={true} extras={[{id:'synthetic-extra',name:'Synthetic helmet',price_php:13,price_centavos:1300,pricing_model:'per_rental',max_per_booking:1,total_quantity:10}]} settings={{public_booking_enabled:false,timezone:'Asia/Manila',privacy_notice:'Synthetic privacy notice',accepted_philippine_id_types:['Synthetic verification document'],philippine_license_policy:'Synthetic reviewed policy',international_license_policy:'Synthetic reviewed policy'}} depositOptions={options}/></main>);`;
  const mocks = {
    "next/link": `import React from 'react';export default function Link({href,...props}){return <a href={href} {...props}/>}`,
    "next/image": `import React from 'react';export default function Image({fill,unoptimized,priority,sizes,...props}){return <img {...props}/>}`,
    "@/lib/supabase/client": `window.submissions=0;window.uploads=0;window.insertions=0;export function createClient(){return {auth:{getUser:async()=>({data:{user:{id:'synthetic-user'}}})},rpc:async(name,p)=>{await new Promise(r=>setTimeout(r,100));if(name==='check_model_availability')return {data:2,error:null};if(name==='submit_booking_request_v3'){window.submissions++;window.lastRequest=p;return {data:[{booking_id:'synthetic-booking',verification_id:'synthetic-verification',booking_reference:'SYN-OFFLINE-9',rental_total_centavos:51300,deposit_required_centavos:p.p_deposit_option==='cash'?12345:0,cash_due_at_pickup_centavos:p.p_deposit_option==='cash'?63645:51300}],error:null}}return {data:[{pricing_units:1,daily_rate_php:500,base_total_centavos:50000,extras_total_centavos:p.p_extra_items.length?1300:0,fees_total_centavos:0,deposit_required_centavos:p.p_deposit_option==='cash'?12345:0,total_centavos:p.p_extra_items.length?51300:50000,cash_due_at_pickup_centavos:p.p_deposit_option==='cash'?63645:51300,policy_version:'2026-10-11T00:00:00Z'}],error:null}},storage:{from:()=>({upload:async()=>{window.uploads++;return {error:null}}})},from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:null,error:null}),insert:async()=>{window.insertions++;if(window.failInsertOnce){window.failInsertOnce=false;return {error:{message:'Synthetic retryable metadata failure'}}}return {error:null}}};return q}}}`,
  };
  const bundle = await esbuild.build({
    stdin: { contents: code, resolveDir: root, loader: "jsx" },
    bundle: true,
    write: false,
    platform: "browser",
    jsx: "automatic",
    nodePaths: [root + "/node_modules"],
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [
      {
        name: "synthetic-only",
        setup(b) {
          b.onResolve({ filter: /^(next\/|@\/)/ }, (a) =>
            mocks[a.path]
              ? { path: a.path, namespace: "mock" }
              : a.path.startsWith("@/")
                ? {
                    path:
                      path.join(root, "src", a.path.slice(2)) +
                      (fs.existsSync(
                        path.join(root, "src", a.path.slice(2)) + ".tsx",
                      )
                        ? ".tsx"
                        : ".ts"),
                  }
                : undefined,
          );
          b.onLoad({ filter: /.*/, namespace: "mock" }, (a) => ({
            contents: mocks[a.path],
            loader: "jsx",
            resolveDir: root,
          }));
        },
      },
    ],
  });
  const html = await (await fetch("http://localhost:3000/faq")).text();
  const urls = [...html.matchAll(/href="([^"]+\.css(?:\?[^\"]*)?)"/g)].map(
    (m) => m[1],
  );
  const css = (
    await Promise.all(
      urls.map((u) => fetch("http://localhost:3000" + u).then((r) => r.text())),
    )
  ).join("\n");
  const server = http.createServer((req, res) => {
    if (req.url === "/client.js") {
      res.setHeader("Content-Type", "application/javascript");
      res.end(bundle.outputFiles[0].text);
    } else if (req.url === "/style.css") {
      res.setHeader("Content-Type", "text/css");
      res.end(css);
    } else {
      res.setHeader("Content-Type", "text/html");
      res.end(
        '<!doctype html><html lang="en"><head><title>Offline Phase 9 checkout</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/client.js"></script></body></html>',
      );
    }
  });
  await new Promise((r) => server.listen(3020, "127.0.0.1", r));
  if (process.env.KJM_CHECKOUT_REVIEW === "1") {
    console.log(
      "Offline synthetic checkout review: http://127.0.0.1:3020 — no Supabase connection",
    );
    return;
  }
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const report = {
    scope:
      "Offline actual checkout component, mocked transport; no authentication or production data",
    layouts: [],
    accessibility: [],
    interactions: [],
    errors: [],
  };
  page.on("pageerror", (e) => report.errors.push(e.message));
  function check(name, pass) {
    report.interactions.push({ name, pass });
    if (!pass) throw Error(name);
  }
  async function layout(stage) {
    for (const width of [360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      report.layouts.push({
        stage,
        width,
        overflow: await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      });
      if ([390, 1440].includes(width)) {
        await page.screenshot({
          path: path.join(output, stage + "-" + width + ".png"),
          fullPage: true,
        });
        const a = await new Axe({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        report.accessibility.push({
          stage,
          width,
          violations: a.violations.map((v) => ({
            id: v.id,
            nodes: v.nodes.map((n) => n.target),
          })),
        });
      }
    }
  }
  async function next() {
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.waitForTimeout(220);
  }
  async function prepare(idEnabled = false) {
    await page.goto("http://127.0.0.1:3020/" + (idEnabled ? "?id=1" : ""));
    await page.waitForTimeout(200);
    await page
      .locator('input[aria-label="Pickup date and time"]')
      .fill("2033-06-10T09:00", { force: true });
    await page
      .locator('input[aria-label="Return date and time"]')
      .fill("2033-06-11T09:00", { force: true });
    await next();
    await page
      .getByRole("button", { name: "Add one Synthetic helmet" })
      .click();
    await next();
    for (const [label, value] of [
      ["Full legal name", "Synthetic Customer"],
      ["Email", "synthetic@example.invalid"],
      ["Mobile number", "+639000000000"],
      ["Country of residence", "Philippines"],
    ])
      await page.getByLabel(label, { exact: true }).fill(value);
    await next();
    for (const [label, value] of [
      ["Name on identity document", "Synthetic Customer"],
      ["Name on driver's license", "Synthetic Customer"],
      ["License expiration", "2035-01-01"],
      ["Permitted vehicle categories", "A"],
    ])
      await page.getByLabel(label, { exact: true }).fill(value);
    for (const label of ["Government ID", "Driver's license front"]) {
      const files = page.locator("input[type=file]");
      const input = label === "Government ID" ? files.nth(0) : files.nth(1);
      await input.setInputFiles({
        name: "synthetic.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("synthetic offline fixture"),
      });
    }
    await next();
  }
  try {
    await prepare();
    await layout("checkout-deposit");
    check(
      "Legally unapproved ID remains disabled",
      await page.getByRole("radio", { name: /Eligible ID/ }).isDisabled(),
    );
    await page.getByRole("radio", { name: /Cash Security Deposit/ }).check();
    await next();
    await layout("checkout-review");
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: /Submit request/i })
      .evaluate((b) => {
        b.click();
        b.click();
      });
    await page.waitForTimeout(700);
    check(
      "Cash submission receives pending request",
      await page
        .getByRole("heading", { name: "Booking Request Received" })
        .isVisible(),
    );
    check(
      "Single booking submission and two verification uploads",
      await page.evaluate(
        () =>
          window.submissions === 1 &&
          window.uploads === 2 &&
          window.insertions === 2,
      ),
    );
    check(
      "Immutable quote version and cash choice sent",
      await page.evaluate(
        () =>
          window.lastRequest.p_policy_version === "2026-10-11T00:00:00Z" &&
          window.lastRequest.p_deposit_option === "cash",
      ),
    );
    await layout("checkout-received");
    await prepare(true);
    await page.getByRole("radio", { name: /Eligible ID/ }).check();
    await page
      .getByRole("combobox", { name: /Approved physical document type/ })
      .selectOption("Synthetic legally reviewed card");
    await next();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /Submit request/i }).click();
    await page.waitForTimeout(700);
    check(
      "Synthetic approved ID request retains exact document",
      await page.evaluate(
        () =>
          window.lastRequest.p_document_type ===
          "Synthetic legally reviewed card",
      ),
    );
    await prepare();
    await page.getByRole("radio", { name: /Cash Security Deposit/ }).check();
    await next();
    await page.getByRole("checkbox").check();
    await page.evaluate(() => (window.failInsertOnce = true));
    await page.getByRole("button", { name: /Submit request/i }).click();
    await page.waitForTimeout(500);
    check(
      "Failed document metadata keeps retry available",
      await page.getByRole("button", { name: /Submit request/i }).isEnabled(),
    );
    await page.getByRole("button", { name: /Submit request/i }).click();
    await page.waitForTimeout(700);
    check(
      "Document retry does not duplicate uploaded objects",
      await page.evaluate(
        () =>
          window.uploads === 2 &&
          window.submissions === 2 &&
          window.insertions === 3,
      ),
    );
    check(
      "Retry receives same pending reference",
      await page
        .getByRole("heading", { name: "Booking Request Received" })
        .isVisible(),
    );
    await context.grantPermissions([]);
    await page.emulateMedia({ reducedMotion: "reduce" });
    check(
      "Reduced-motion request receipt stays visible",
      await page
        .getByRole("heading", { name: "Booking Request Received" })
        .isVisible(),
    );
  } catch (e) {
    report.errors.push(e.message);
  } finally {
    fs.writeFileSync(
      path.join(__dirname, "checkout-browser-results.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
