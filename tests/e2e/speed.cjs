const { chromium } = require("playwright");
const { createClient } = require("@supabase/supabase-js");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const BASE = process.env.E2E_BASE_URL || "http://localhost:3300", tag = Date.now() % 100000, LABEL = process.argv[2] || "run";
const PAGES = ["/dashboard", "/meals", "/bazar", "/costs", "/deposits", "/members", "/sheet", "/roster", "/notices", "/report", "/more"];
(async () => {
  const today = new Date(Date.now() + 6 * 36e5).toISOString().slice(0, 10), month = today.slice(0, 8) + "01";
  const users = [];
  const mk = async (n) => { const id = (await admin.auth.admin.createUser({ email: `zz.${n}.${tag}@users.messflow.app`, password: "verify-123", email_confirm: true, user_metadata: { full_name: n } })).data.user.id; users.push(id); return id; };
  const R = await mk("rahim");
  const { data: mess } = await admin.from("messes").insert({ name: `ZZ Perf ${tag}`, created_by: R }).select("id").single();
  await admin.from("mess_members").insert({ mess_id: mess.id, joined_on: month, role: "manager", claim_code: null, user_id: R, display_name: "Rahim", default_lunch: true, default_dinner: true });
  for (let i = 1; i <= 11; i++) await admin.from("mess_members").insert({ mess_id: mess.id, joined_on: month, role: "member", claim_code: null, user_id: null, display_name: "Member " + i, default_lunch: true, default_dinner: true });
  const b = await chromium.launch();
  try {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage();
    await p.goto(BASE + "/en/login", { waitUntil: "networkidle" });
    await p.fill('input[name="email"]', `zz.rahim.${tag}`); await p.fill('input[name="password"]', "verify-123");
    await p.click('button[type="submit"]'); await p.waitForURL((x) => !x.pathname.endsWith("/login"), { timeout: 60000 });
    await ctx.addCookies([{ name: "mf_mess", value: mess.id, url: BASE }]);
    // warm up
    for (const path of PAGES) await p.goto(BASE + "/en" + path, { waitUntil: "load" });
    const full = {}, nav = {};
    for (let round = 0; round < 3; round++) for (const path of PAGES) {
      await p.goto(BASE + "/en" + path, { waitUntil: "load" });
      const t = await p.evaluate(() => { const n = performance.getEntriesByType("navigation")[0]; return Math.round(n.responseStart - n.requestStart); });
      (full[path] ??= []).push(t);
    }
    // in-app (client) navigation: click the link and wait until the URL + main content change
    for (let round = 0; round < 3; round++) for (const path of ["/meals", "/dashboard", "/bazar", "/deposits", "/dashboard"]) {
      const t0 = Date.now();
      await p.evaluate((h) => { const a = [...document.querySelectorAll("a")].find((x) => new URL(x.href).pathname === h); if (a) a.click(); else location.href = h; }, "/en" + path);
      await p.waitForURL("**/en" + path); await p.waitForLoadState("networkidle");
      (nav[path] ??= []).push(Date.now() - t0);
    }
    const med = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
    console.log(`== ${LABEL}: server time (TTFB, ms, median of 3) ==`);
    let sum = 0; for (const [k, v] of Object.entries(full)) { const m = med(v); sum += m; console.log(k.padEnd(12), m); }
    console.log("average".padEnd(12), Math.round(sum / PAGES.length));
    console.log(`== ${LABEL}: tap a menu link -> page ready (ms, median) ==`);
    for (const [k, v] of Object.entries(nav)) console.log(k.padEnd(12), med(v));
  } finally {
    await b.close();
    await admin.from("messes").delete().eq("id", mess.id);
    for (const id of users) await admin.auth.admin.deleteUser(id);
  }
})();
