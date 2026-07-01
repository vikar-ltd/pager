// End-to-end verifier for the tracker snippet against a real Next.js App
// Router site. Runs inside a Playwright container on the pager docker network
// so it can reach the demo (`http://demo:3000`) and pager (`http://caddy`)
// services directly.
//
// The flow:
//   1. Log in to Pager, create a fresh property and an event goal.
//   2. Launch Chromium and open the demo with UTM params.
//   3. Configure the tracker via localStorage, reload, then Link-click through
//      /about → /pricing → /signup, click the CTA (fires a custom event),
//      and wait for the /done redirect.
//   4. Query Pager's report APIs and assert one visitor, one session, five
//      pageviews (/, /about, /pricing, /signup, /done), one custom event, and
//      one goal hit — proving SPA route detection works end-to-end.

import { chromium } from "playwright";

const PAGER = process.env.PAGER_URL || "http://caddy";
const DEMO = process.env.DEMO_URL || "http://demo:3000";

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("  ✓", msg);
}

async function main() {
  // ---- log in to Pager
  const loginRes = await fetch(`${PAGER}/int/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "changeme" }),
  });
  if (!loginRes.ok) throw new Error(`login failed: ${loginRes.status}`);
  const setCookie = loginRes.headers.get("set-cookie") || "";
  const cookie = setCookie.split(";")[0];

  const authed = async (path, init = {}) => {
    const res = await fetch(PAGER + path, {
      ...init,
      headers: { "Content-Type": "application/json", Cookie: cookie, ...(init.headers || {}) },
    });
    if (res.status === 204) return null;
    if (!res.ok) throw new Error(`${init.method || "GET"} ${path} → ${res.status}`);
    return res.json();
  };

  // ---- create a fresh property + one event goal
  const prop = await authed("/int/api/properties", {
    method: "POST",
    body: JSON.stringify({ name: "SPA E2E " + Date.now(), domain: "demo:3000" }),
  });
  await authed(`/int/api/properties/${prop.id}/goals`, {
    method: "POST",
    body: JSON.stringify({ name: "Sign up", kind: "event", pattern: "signup_completed" }),
  });
  console.log(`\nProperty ${prop.id} siteId=${prop.siteId}\n`);

  // ---- browser
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // Capture tracker beacons for visibility. sendBeacon sends a Blob body which
  // .postData() returns as null, so we fall back to .postDataBuffer().
  const collected = [];
  page.on("request", (req) => {
    if (req.url().includes("/pub/")) {
      const buf = req.postDataBuffer();
      collected.push({
        method: req.method(),
        url: req.url(),
        body: buf ? buf.toString("utf8") : req.postData(),
      });
    }
  });
  page.on("response", (res) => {
    if (res.url().includes("/pub/collect")) {
      console.log(`   beacon ← ${res.status()}`);
    }
  });
  page.on("console", (msg) => {
    const txt = msg.text();
    if (msg.type() === "error") console.log(`   [browser error] ${txt}`);
    if (txt.startsWith("[pgr]")) console.log(`   ${txt}`);
  });

  console.log("--- navigation ---");
  await page.goto(`${DEMO}/?utm_source=twitter&utm_campaign=e2e`, { waitUntil: "networkidle" });
  await page.evaluate(
    ([siteId, pagerUrl]) => {
      localStorage.setItem("pager_site_id", siteId);
      localStorage.setItem("pager_url", pagerUrl);
    },
    [prop.siteId, PAGER],
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.evaluate(() => { window.__PGR_DEBUG__ = true; });
  console.log("  loaded  /?utm_source=twitter&utm_campaign=e2e");

  await page.click('a[href="/about"]');
  await page.waitForURL("**/about", { timeout: 5000 });
  console.log("  linked  /about");

  await page.click('a[href="/pricing"]');
  await page.waitForURL("**/pricing", { timeout: 5000 });
  console.log("  linked  /pricing");

  await page.click('a[href="/signup"]');
  await page.waitForURL("**/signup", { timeout: 5000 });
  console.log("  linked  /signup");

  await page.click('main button');
  await page.waitForURL("**/done", { timeout: 5000 });
  console.log("  linked  /done (post-CTA)");

  // give beacons a moment to flush before we assert
  await page.waitForTimeout(1500);
  await browser.close();

  console.log(`\n${collected.length} /pub/* requests captured:`);
  for (const c of collected) {
    let p = {};
    try { p = JSON.parse(c.body || "{}"); } catch {}
    const shortUrl = c.url.replace(/^https?:\/\/[^/]+/, "");
    const line = `${c.method.padEnd(5)} ${shortUrl.padEnd(20)}`;
    if (p.type) {
      const name = p.name ? `name=${p.name}` : "";
      console.log(`  ${line} type=${p.type.padEnd(9)} ${name.padEnd(28)} path=${p.path ?? "?"}`);
    } else {
      console.log(`  ${line} body=${(c.body || "").slice(0, 80)}`);
    }
  }

  // ---- assert on the pager side
  console.log("\n--- assertions ---");
  const visitors = await authed(`/int/api/properties/${prop.id}/visitors?range=24h`);
  assert(visitors.rows.length === 1, `exactly one visitor recorded (got ${visitors.rows.length})`);
  const vid = visitors.rows[0].id;

  const tl = await authed(`/int/api/properties/${prop.id}/visitors/${vid}/timeline`);
  assert(tl.sessions.length === 1, `exactly one session (got ${tl.sessions.length})`);
  const s = tl.sessions[0];

  const paths = s.events
    .filter((e) => e.type === "pageview")
    .map((e) => e.path.split("?")[0]);
  const expected = ["/", "/about", "/pricing", "/signup", "/done"];
  for (const p of expected) {
    assert(paths.includes(p), `pageview recorded for ${p}`);
  }

  const events = s.events.filter((e) => e.type === "event").map((e) => e.name);
  assert(events.includes("signup_completed"), "signup_completed custom event recorded");

  assert((s.goalsHit || []).length >= 1, "goal was hit (goalsHit non-empty)");
  assert(s.utm?.source === "twitter", `session UTM source captured (got ${s.utm?.source})`);
  assert(s.utm?.campaign === "e2e", `session UTM campaign captured (got ${s.utm?.campaign})`);

  console.log("\n✅ SPA verification PASSED");
}

main().catch((e) => {
  console.error("\n💥 verification failed:", e);
  process.exit(1);
});
