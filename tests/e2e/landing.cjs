const { chromium } = require("playwright");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const BASE = process.env.E2E_BASE_URL || "http://localhost:3300", tag = Date.now() % 100000, OUT = process.env.SP + "/landing";
fs.mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  - " + x : ""}`); };
(async () => {
  const month = new Date(Date.now() + 6 * 36e5).toISOString().slice(0, 8) + "01";
  const users = [];
  const mk = async (n) => { const id = (await admin.auth.admin.createUser({ email: `zz.${n}.${tag}@users.messflow.app`, password: "verify-123", email_confirm: true, user_metadata: { full_name: n } })).data.user.id; users.push(id); return id; };
  const K = await mk("karim"), C = await mk("khala"), S = await mk("boss");
  await admin.from("profiles").update({ is_super_admin: true }).eq("id", S);
  const { data: mess } = await admin.from("messes").insert({ name: `ZZ Landing ${tag}`, created_by: K }).select("id").single();
  await admin.from("mess_members").insert({ mess_id: mess.id, joined_on: month, user_id: K, display_name: "Karim", role: "member", claim_code: null });
  await admin.from("mess_cooks").insert({ mess_id: mess.id, user_id: C, name: "Khala" });
  const browser = await chromium.launch();
  const errs = [];
  try {
    for (const [w, h, scheme] of [[360, 760, "light"], [390, 844, "light"], [390, 844, "dark"], [768, 1024, "light"], [1280, 900, "light"], [1440, 900, "dark"]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, isMobile: w < 500, hasTouch: w < 500 });
      const p = await ctx.newPage();
      p.on("pageerror", (e) => errs.push(`${w}: ${e.message}`));
      p.on("console", (m) => m.type() === "error" && errs.push(`${w} console: ${m.text().slice(0, 150)}`));
      await p.goto(BASE + "/bn", { waitUntil: "networkidle", timeout: 180000 });
      await p.waitForTimeout(400);
      const sideways = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      ok(`${w}px ${scheme}: no sideways scroll`, !sideways);
      const imgs = await p.evaluate(() => [...document.images].filter((i) => i.offsetParent).map((i) => i.naturalWidth > 0));
      ok(`${w}px ${scheme}: screenshots load`, imgs.length > 0 && imgs.every(Boolean), JSON.stringify(imgs));
      const navLogin = p.locator("header").getByRole("link", { name: "লগইন" });
      ok(`${w}px: navbar has লগইন`, await navLogin.isVisible());
      await p.screenshot({ path: `${OUT}/bn-${w}-${scheme}.png`, fullPage: w <= 390 || w === 1280 });
      await ctx.close();
    }
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(BASE + "/", { waitUntil: "networkidle" });
    ok("/ opens the Bangla landing", p.url().endsWith("/bn") && (await p.locator("h1").innerText()).includes("মেস চালান ঝামেলা ছাড়া"), p.url());
    ok("link preview tags (title, description, image)", (await p.locator('meta[property="og:image"]').getAttribute("content"))?.includes("/landing/og.png") && !!(await p.locator('meta[property="og:description"]').getAttribute("content")));
    ok("page title", (await p.title()) === "মেসফ্লো - মেস চালান ঝামেলা ছাড়া", await p.title());
    await p.locator("header").getByRole("link", { name: "শুরু করুন" }).click();
    await p.waitForURL(/\/bn\/signup/); ok("শুরু করুন → sign up", true);
    await p.goto(BASE + "/bn", { waitUntil: "networkidle" });
    await p.locator("header").getByRole("link", { name: "লগইন" }).click();
    await p.waitForURL(/\/bn\/login/); ok("লগইন → login", true);
    await p.goto(BASE + "/en", { waitUntil: "networkidle" });
    ok("English landing", (await p.locator("h1").innerText()).includes("Run your mess, hassle-free"));
    await p.screenshot({ path: `${OUT}/en-1280.png` });
    await ctx.close();
    for (const [who, want] of [["karim", "/bn/dashboard"], ["khala", "/bn/kitchen"], ["boss", "/bn/admin"]]) {
      const c2 = await browser.newContext(); const q = await c2.newPage();
      await q.goto(BASE + "/bn/login", { waitUntil: "networkidle" });
      await q.fill('input[name="email"]', `zz.${who}.${tag}`); await q.fill('input[name="password"]', "verify-123");
      await q.click('button[type="submit"]'); await q.waitForURL((x) => !x.pathname.endsWith("/login"), { timeout: 120000 });
      await q.goto(BASE + "/bn", { waitUntil: "networkidle" });
      ok(`logged in ${who}: home goes to ${want}`, q.url().endsWith(want), q.url());
      await c2.close();
    }
    ok("no page errors", errs.length === 0, errs.slice(0, 3).join(" | "));
  } catch (e) { fail++; console.log("ERROR", e.message.split("\n")[0]); }
  finally {
    await browser.close();
    await admin.from("messes").delete().eq("id", mess.id);
    for (const id of users) await admin.auth.admin.deleteUser(id);
    console.log(`cleaned up\n\n${pass} passed, ${fail} failed`);
  }
})();
