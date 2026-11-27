const { chromium } = require("playwright");
const { createClient } = require("@supabase/supabase-js");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const BASE = process.env.E2E_BASE_URL || "http://localhost:3300", tag = Date.now() % 100000;
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  - " + x : ""}`); };
(async () => {
  const today = new Date(Date.now() + 6 * 36e5).toISOString().slice(0, 10), month = today.slice(0, 8) + "01";
  const mk = async (n) => (await admin.auth.admin.createUser({ email: `zz.${n}.${tag}@users.messflow.app`, password: "verify-123", email_confirm: true, user_metadata: { full_name: n } })).data.user.id;
  const R = await mk("rahim"), K = await mk("karim");
  const { data: mess } = await admin.from("messes").insert({ name: `ZZ Cursor ${tag}`, created_by: R }).select("id").single();
  await admin.from("mess_members").insert([
    { mess_id: mess.id, joined_on: month, user_id: R, display_name: "Rahim", role: "manager", claim_code: null, default_lunch: true, default_dinner: true },
    { mess_id: mess.id, joined_on: month, user_id: K, display_name: "Karim", role: "member", claim_code: null, default_lunch: true, default_dinner: true },
  ]);
  const browser = await chromium.launch();
  const login = async (who) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(BASE + "/en/login", { waitUntil: "networkidle", timeout: 180000 });
    await page.fill('input[name="email"]', `zz.${who}.${tag}`); await page.fill('input[name="password"]', "verify-123");
    await page.click('button[type="submit"]'); await page.waitForURL((x) => !x.pathname.endsWith("/login"), { timeout: 120000 });
    await ctx.addCookies([{ name: "mf_mess", value: mess.id, url: BASE }]);
    return page;
  };
  const cur = (page, loc) => loc.first().evaluate((el) => getComputedStyle(el).cursor);
  try {
    const r = await login("rahim");
    await r.goto(BASE + "/en/meals", { waitUntil: "networkidle", timeout: 120000 });
    ok("Save menu button: hand", (await cur(r, r.getByRole("button", { name: "Save menu" }))) === "pointer");
    ok("Khala's leave button: hand", (await cur(r, r.getByRole("button", { name: /Khala's leave/ }))) === "pointer");
    ok("meal toggle (manager): hand", (await cur(r, r.locator("main table button[aria-pressed]:not([aria-label])").first())) === "pointer");
    ok("checkbox label (Lunch default): hand", (await cur(r, r.locator("label:has(> input[type=checkbox])"))) === "pointer");
    ok("select: hand", (await cur(r, r.locator("select"))) === "pointer");
    ok("sidebar link: hand", (await cur(r, r.locator('aside a, nav a'))) === "pointer");
    await r.goto(BASE + "/en/members", { waitUntil: "networkidle" });
    ok("expandable section (Edit / Bills): hand", (await cur(r, r.locator("summary"))) === "pointer");
    ok("plain text: normal arrow", (await cur(r, r.locator("h1"))) === "auto");
    const k = await login("karim");
    await k.goto(BASE + "/en/meals", { waitUntil: "networkidle" });
    const lockedCal = k.locator('button[disabled]').first();
    ok("member: a locked (past) meal is not a hand", ["default", "auto"].includes(await cur(k, lockedCal)), await cur(k, lockedCal));
    const open = k.locator("main button:not([disabled])").first();
    ok("member: an open meal button is a hand", (await cur(k, open)) === "pointer");
  } catch (e) { fail++; console.log("ERROR", e.message.split("\n")[0]); }
  finally {
    await browser.close();
    await admin.from("messes").delete().eq("id", mess.id);
    for (const id of [R, K]) await admin.auth.admin.deleteUser(id);
    console.log(`cleaned up\n\n${pass} passed, ${fail} failed`);
  }
})();
