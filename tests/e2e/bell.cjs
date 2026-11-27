const { chromium } = require("playwright");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const BASE = process.env.E2E_BASE_URL || "http://localhost:3300", tag = Date.now() % 100000, OUT = process.env.SP + "/bell", NAME = process.env.NAME || "before";
fs.mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  - " + x : ""}`); };
(async () => {
  const month = new Date(Date.now() + 6 * 36e5).toISOString().slice(0, 8) + "01";
  const mk = async (n) => (await admin.auth.admin.createUser({ email: `zz.${n}.${tag}@users.messflow.app`, password: "verify-123", email_confirm: true, user_metadata: { full_name: n } })).data.user.id;
  const R = await mk("rahim"), K = await mk("karim");
  const { data: mess } = await admin.from("messes").insert({ name: `ZZ Bell ${tag}`, created_by: R }).select("id").single();
  await admin.from("mess_members").insert([
    { mess_id: mess.id, joined_on: month, user_id: R, display_name: "Rahim", role: "manager", claim_code: null },
    { mess_id: mess.id, joined_on: month, user_id: K, display_name: "Karim", role: "member", claim_code: null },
  ]);
  const now = Date.now();
  await admin.from("notifications").insert([
    { user_id: K, title: "🍳 খালা ছুটিতে", body: "শুক্রবার ২৭ নভেম্বর সবার দুপুর বন্ধ। আপনি রান্না করলে অ্যাপে \"আমি রান্না করব\" চাপুন।", url: "/bn/meals", created_at: new Date(now - 60e3).toISOString() },
    { user_id: K, title: "💰 আপনার বাকি ৳১,২০০", body: "দয়া করে এই সপ্তাহে ম্যানেজারকে টাকা দিন। ধন্যবাদ!", url: "/bn/dashboard", created_at: new Date(now - 3600e3).toISOString() },
    { user_id: K, title: "📢 Water tank cleaning on Friday", body: "Please store some water on Thursday night.", url: "/bn/notices", created_at: new Date(now - 86400e3).toISOString(), read_at: new Date().toISOString() },
  ]);
  const browser = await chromium.launch();
  try {
    for (const [w, h] of [[390, 844], [360, 740], [1280, 900]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 500, hasTouch: w < 500, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      await page.goto(BASE + "/bn/login", { waitUntil: "networkidle", timeout: 180000 });
      await page.fill('input[name="email"]', `zz.karim.${tag}`); await page.fill('input[name="password"]', "verify-123");
      await page.click('button[type="submit"]'); await page.waitForURL((x) => !x.pathname.endsWith("/login"), { timeout: 120000 });
      await ctx.addCookies([{ name: "mf_mess", value: mess.id, url: BASE }]);
      await page.goto(BASE + "/bn/dashboard", { waitUntil: "networkidle" });
      await page.locator("header summary").first().click();
      await page.waitForTimeout(500);
      const panel = page.locator("header details[open] > div").last();
      const b = await panel.boundingBox();
      ok(`${w}px: panel fully on screen`, b && b.x >= 0 && b.x + b.width <= w + 0.5, b && `x=${Math.round(b.x)} right=${Math.round(b.x + b.width)}`);
      ok(`${w}px: no sideways scroll`, !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
      await page.screenshot({ path: `${OUT}/${NAME}-${w}.png` });
      await ctx.close();
    }
  } catch (e) { fail++; console.log("ERROR", e.message.split("\n")[0]); }
  finally {
    await browser.close();
    await admin.from("messes").delete().eq("id", mess.id);
    for (const id of [R, K]) await admin.auth.admin.deleteUser(id);
    console.log(`cleaned up\n\n${pass} passed, ${fail} failed`);
  }
})();
