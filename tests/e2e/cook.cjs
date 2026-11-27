// Cook (khala) login + daily menu, end to end. Cleans up at the end.
const { chromium } = require("playwright");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const BASE = process.env.E2E_BASE_URL || "http://localhost:3300", tag = Date.now() % 100000;
const OUT = process.env.SP + "/cook"; fs.mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  - " + x : ""}`); };
(async () => {
  const today = new Date(Date.now() + 6 * 36e5).toISOString().slice(0, 10), month = today.slice(0, 8) + "01";
  const mk = async (n) => (await admin.auth.admin.createUser({ email: `zz.${n}.${tag}@users.messflow.app`, password: "verify-123", email_confirm: true, user_metadata: { full_name: n } })).data.user.id;
  const R = await mk("rahim"), M = await mk("karim");
  const { data: mess } = await admin.from("messes").insert({ name: `ZZ Cook ${tag}`, created_by: R }).select("id").single();
  const ins = async (row) => (await admin.from("mess_members").insert({ mess_id: mess.id, joined_on: month, ...row }).select("id").single()).data.id;
  const mR = await ins({ user_id: R, display_name: "Rahim", role: "manager", claim_code: null });
  const mM = await ins({ user_id: M, display_name: "Karim", claim_code: null });
  const mJ = await ins({ display_name: "Jamal" });
  await admin.from("meals").upsert([
    { mess_id: mess.id, member_id: mR, date: today, lunch: true, half_lunch: false, guest_lunch: 0, dinner: true, source: "manager" },
    { mess_id: mess.id, member_id: mM, date: today, lunch: true, half_lunch: true, guest_lunch: 1, dinner: true, source: "manager" },
    { mess_id: mess.id, member_id: mJ, date: today, lunch: false, half_lunch: false, guest_lunch: 0, dinner: true, source: "manager" },
  ], { onConflict: "member_id,date" });
  const browser = await chromium.launch();
  const errs = [];
  const login = async (user, password, width = 1280) => {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(BASE + "/en/login", { waitUntil: "networkidle", timeout: 180000 });
    await page.fill('input[name="email"]', user); await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]'); await page.waitForURL((x) => !x.pathname.endsWith("/login"), { timeout: 120000 });
    await ctx.addCookies([{ name: "mf_mess", value: mess.id, url: BASE }]);
    return page;
  };
  let cookUserId = null;
  try {
    const r = await login(`zz.rahim.${tag}`, "verify-123");
    await r.goto(BASE + "/en/members", { waitUntil: "networkidle", timeout: 120000 });
    const card = r.locator("section", { hasText: "Cook / Khala" });
    ok("manager sees the Cook / Khala card", await card.count() > 0);
    await card.getByRole("button", { name: "Add cook login" }).click();
    await card.locator('input[name="name"]').fill("ZZ Khala");
    await card.locator('input[name="login"]').fill(`zz.khala.${tag}`);
    await card.locator('input[name="password"]').last().fill("khala-123");
    await card.getByRole("button", { name: "Create cook login" }).click();
    await r.getByText("Cook login ready").waitFor({ timeout: 30000 });
    ok("cook login created, details shown", (await card.innerText()).includes(`zz.khala.${tag}`));
    const { data: cookRow } = await admin.from("mess_cooks").select("user_id").eq("mess_id", mess.id).single();
    cookUserId = cookRow?.user_id;
    const { count: memberCount } = await admin.from("mess_members").select("id", { count: "exact", head: true }).eq("mess_id", mess.id);
    ok("cook is NOT added as a member", memberCount === 3);

    await r.goto(BASE + "/en/meals", { waitUntil: "networkidle", timeout: 120000 });
    const menuCard = r.locator("section", { hasText: "What to cook" });
    await menuCard.locator('input[name="lunch"]').fill("Rice, chicken, dal");
    await menuCard.locator('input[name="dinner"]').fill("Rice, fish");
    await menuCard.getByRole("button", { name: "Save menu" }).click();
    await r.getByText("Menu saved").waitFor({ timeout: 30000 });
    ok("manager saved today's menu", true);
    await r.goto(BASE + "/en/dashboard", { waitUntil: "networkidle", timeout: 120000 });
    ok("manager dashboard shows the menu", (await r.locator("main").innerText()).includes("What to cook: Lunch: Rice, chicken, dal · Dinner: Rice, fish"));

    const m = await login(`zz.karim.${tag}`, "verify-123", 390);
    await m.goto(BASE + "/en/dashboard", { waitUntil: "networkidle" });
    ok("member dashboard shows the menu", (await m.locator("main").innerText()).includes("Rice, chicken, dal"));
    await m.goto(BASE + "/en/meals", { waitUntil: "networkidle" });
    const mc = m.locator("section", { hasText: "What to cook" });
    ok("member sees the menu read-only (no inputs)", (await mc.innerText()).includes("Rice, fish") && (await mc.locator("input").count()) === 0);

    const c = await login(`zz.khala.${tag}`, "khala-123", 390);
    await c.waitForURL((x) => x.pathname.endsWith("/change-password"), { timeout: 30000 }).catch(() => {});
    ok("cook must change the temporary password first", c.url().includes("/change-password"), c.url());
    await c.fill('input[name="password"]', "khala-new-1"); await c.fill('input[name="confirm"]', "khala-new-1");
    await c.click('button[type="submit"]');
    await c.waitForURL((x) => x.pathname.endsWith("/kitchen"), { timeout: 120000 });
    ok("after that the cook lands on the kitchen page", c.url().endsWith("/en/kitchen"));
    await c.waitForLoadState("networkidle");
    const txt = await c.locator("main").innerText();
    ok("lunch count = 2.5 (1 + half + 1 guest)", /Lunch\s*2\.5\s*meals/.test(txt), txt.match(/Lunch\s*[\d.]+/)?.[0]);
    ok("dinner count = 3", /Dinner\s*3\s*meals/.test(txt), txt.match(/Dinner\s*[\d.]+/)?.[0]);
    ok("menu in big text", txt.includes("Cook: Rice, chicken, dal") && txt.includes("Cook: Rice, fish"));
    ok("each meal says Final or May change until …", (txt.match(/Final - won't change|May change until/g) || []).length === 2, txt.match(/Final - won't change|May change until [^\n]*/g)?.join(" / "));
    ok("no names, money or menu bar on the page", !/Karim|Jamal|Rahim|৳|Deposits|Bazar/.test(await c.locator("body").innerText()));
    for (const p of ["/en/dashboard", "/en/members", "/en/sheet", "/en/onboarding", "/en/profile"]) {
      await c.goto(BASE + p, { waitUntil: "networkidle", timeout: 120000 });
      ok(`cook opening ${p} is sent back to the kitchen`, c.url().endsWith("/en/kitchen"), c.url());
    }
    await c.screenshot({ path: `${OUT}/kitchen-en.png`, fullPage: true });
    await c.goto(BASE + "/bn/kitchen", { waitUntil: "networkidle" });
    const bn = await c.locator("main").innerText();
    ok("Bangla: আজকের রান্না, ২.৫ মিল", bn.includes("আজকের রান্না") && bn.includes("২.৫"), bn.slice(0, 80).replace(/\n/g, " | "));
    await c.screenshot({ path: `${OUT}/kitchen-bn.png`, fullPage: true });
    await admin.from("meals").update({ lunch: false }).eq("member_id", mR).eq("date", today);
    await c.reload({ waitUntil: "networkidle" });
    ok("count follows changes (Rahim off → lunch ১.৫)", (await c.locator("main").innerText()).includes("১.৫"));

    await r.goto(BASE + "/en/members", { waitUntil: "networkidle" });
    const card2 = r.locator("section", { hasText: "Cook / Khala" });
    await card2.getByRole("button", { name: "Remove" }).click();
    await r.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
    await r.waitForTimeout(4000);
    const { data: gone } = await admin.auth.admin.getUserById(cookUserId);
    ok("remove deletes the cook login", !gone?.user);
    if (!gone?.user) cookUserId = null;
    ok("no page errors", errs.length === 0, errs.join(" | "));
  } catch (e) { fail++; console.log("ERROR", e.message.split("\n")[0]); }
  finally {
    await browser.close();
    await admin.from("messes").delete().eq("id", mess.id);
    for (const id of [R, M, cookUserId].filter(Boolean)) await admin.auth.admin.deleteUser(id);
    console.log(`cleaned up\n\n${pass} passed, ${fail} failed`);
  }
})();
