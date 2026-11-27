// Khala's leave: mark, member offers to cook, manager approves, cook page, cancel. Cleans up.
const { chromium } = require("playwright");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const BASE = process.env.E2E_BASE_URL || "http://localhost:3300", tag = Date.now() % 100000;
const OUT = process.env.SP + "/leave"; fs.mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  - " + x : ""}`); };
(async () => {
  const today = new Date(Date.now() + 6 * 36e5).toISOString().slice(0, 10), month = today.slice(0, 8) + "01";
  const tmr = new Date(Date.parse(today) + 864e5).toISOString().slice(0, 10);
  const mk = async (n) => (await admin.auth.admin.createUser({ email: `zz.${n}.${tag}@users.messflow.app`, password: "verify-123", email_confirm: true, user_metadata: { full_name: n } })).data.user.id;
  const R = await mk("rahim"), K = await mk("karim"), C = await mk("khala");
  const { data: mess } = await admin.from("messes").insert({ name: `ZZ Leave ${tag}`, created_by: R }).select("id").single();
  const ins = async (row) => (await admin.from("mess_members").insert({ mess_id: mess.id, joined_on: month, default_lunch: true, default_dinner: true, ...row }).select("id").single()).data.id;
  await ins({ user_id: R, display_name: "Rahim", role: "manager", claim_code: null });
  const mK = await ins({ user_id: K, display_name: "Karim", claim_code: null });
  await ins({ display_name: "Jamal" });
  await admin.from("mess_cooks").insert({ mess_id: mess.id, user_id: C, name: "Khala" });
  const meals = async (d) => (await admin.from("meals").select("member_id, lunch, dinner").eq("mess_id", mess.id).eq("date", d)).data ?? [];
  const browser = await chromium.launch();
  const errs = [];
  const login = async (who, width = 1280) => {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(BASE + "/en/login", { waitUntil: "networkidle", timeout: 180000 });
    await page.fill('input[name="email"]', `zz.${who}.${tag}`); await page.fill('input[name="password"]', "verify-123");
    await page.click('button[type="submit"]'); await page.waitForURL((x) => !x.pathname.endsWith("/login"), { timeout: 120000 });
    await ctx.addCookies([{ name: "mf_mess", value: mess.id, url: BASE }]);
    return page;
  };
  try {
    const r = await login("rahim");
    await r.goto(BASE + "/en/meals", { waitUntil: "networkidle", timeout: 120000 });
    // the leave form now lives in a dialog behind the "Khala's leave" button
    const leaveBox = async () => { if (!(await r.locator("dialog[open]").count())) await r.getByRole("button", { name: /Khala's leave/ }).first().click(); const d = r.locator("dialog[open]"); await d.waitFor(); return d; };
    const card = await leaveBox();
    ok("manager sees the Khala's leave dialog", await card.count() > 0);
    ok("default date is tomorrow, both meals ticked", (await card.locator('input[name="from"]').inputValue()) === tmr && (await card.locator('input[name="meals"]:checked').count()) === 2);
    await card.locator('input[name="meals"][value="dinner"]').uncheck();
    await card.getByRole("button", { name: "Mark leave" }).click();
    await r.getByText("Leave marked").waitFor({ timeout: 30000 });
    let m = await meals(tmr);
    ok("tomorrow's lunch is off for all 3, dinner stays on", m.length === 3 && m.every((x) => !x.lunch && x.dinner), JSON.stringify(m.map((x) => [x.lunch, x.dinner])));
    // notifications are written right after the save (in the background), so give it a few seconds
    let inbox = [];
    for (let i = 0; i < 20 && !inbox.length; i++) { await new Promise((res) => setTimeout(res, 500)); inbox = (await admin.from("notifications").select("title, body").eq("user_id", K)).data ?? []; }
    ok("Karim got the 'Khala on leave' notification", (inbox ?? []).some((n) => /Khala on leave|খালা/.test(n.title)), inbox?.[0]?.body);

    const k = await login("karim", 390);
    await k.goto(BASE + "/en/dashboard", { waitUntil: "networkidle" });
    ok("member dashboard: 'Khala on leave · Tomorrow · Lunch'", /Khala on leave[\s\S]*Tomorrow · Lunch - khala on leave, meal off for everyone/.test(await k.locator("main").innerText()));
    await k.goto(BASE + `/en/meals?date=${tmr}`, { waitUntil: "networkidle" });
    const banner = k.locator("section", { hasText: "Khala on leave" });
    await banner.getByRole("button", { name: "I'll cook" }).click();
    await k.getByText("Waiting for the manager").waitFor({ timeout: 30000 });
    ok("member offers to cook → 'Waiting for the manager'", true);
    await k.screenshot({ path: `${OUT}/member-waiting.png`, fullPage: true });

    await r.goto(BASE + "/en/meals", { waitUntil: "networkidle" });
    ok("manager's bell/nav shows the offer", /1 offer to cook/.test(await r.locator("header").innerHTML()) || (await r.locator('a[href$="/meals"] span', { hasText: "1" }).count()) > 0);
    ok("manager sees 'Karim offered to cook'", await r.getByText("Karim offered to cook").count() > 0);
    await r.screenshot({ path: `${OUT}/manager-offer.png`, fullPage: true });
    await (await leaveBox()).getByRole("button", { name: "Approve" }).click();
    await r.getByText("Approved - everyone").waitFor({ timeout: 30000 });
    m = await meals(tmr);
    ok("approve: Karim's lunch is on, others still off", m.find((x) => x.member_id === mK).lunch && m.filter((x) => x.lunch).length === 1);
    await k.goto(BASE + "/en/dashboard", { waitUntil: "networkidle" });
    ok("member sees 'Karim will cook - turn your meal on if you'll eat'", (await k.locator("main").innerText()).includes("Karim will cook - turn your meal on if you'll eat"));

    // today's dinner leave → kitchen page shows "Leave - no cooking"
    await r.goto(BASE + "/en/meals", { waitUntil: "networkidle" });
    const card2 = await leaveBox();
    await card2.locator('input[name="from"]').fill(today);
    await card2.locator('input[name="meals"][value="lunch"]').uncheck();
    await card2.getByRole("button", { name: "Mark leave" }).click();
    await r.getByText("Leave marked").waitFor({ timeout: 30000 });
    m = await meals(today);
    ok("today's dinner off for everyone", m.every((x) => !x.dinner));
    const c = await login("khala", 390);
    await c.waitForURL((x) => x.pathname.endsWith("/kitchen"), { timeout: 60000 });
    const kt = await c.locator("main").innerText();
    ok("khala's page: Dinner - Leave - no cooking", /Dinner\s*Leave - no cooking/.test(kt), kt.replace(/\n+/g, " | ").slice(0, 160));
    await c.goto(BASE + "/bn/kitchen", { waitUntil: "networkidle" });
    await c.screenshot({ path: `${OUT}/kitchen-leave-bn.png`, fullPage: true });

    // cancel tomorrow's lunch leave
    await r.goto(BASE + "/en/meals", { waitUntil: "networkidle" });
    const row = (await leaveBox()).locator(`li[data-leave="${tmr}:lunch"]`);
    await row.getByRole("button", { name: "Khala is coming" }).click();
    await r.locator("dialog[open]").last().getByRole("button").last().click();
    await r.getByText("Leave cancelled").waitFor({ timeout: 30000 });
    m = await meals(tmr);
    ok("cancel: tomorrow's lunch back on for everyone (defaults)", m.every((x) => x.lunch));
    ok("leave record is shown", (await (await leaveBox()).innerText()).includes("Khala's leave this month"));
    await r.goto(BASE + "/bn/meals", { waitUntil: "networkidle" });
    ok("Bangla card: খালার ছুটি", (await r.locator("main").innerText()).includes("খালার ছুটি"));
    ok("no page errors", errs.length === 0, errs.join(" | "));
  } catch (e) { fail++; console.log("ERROR", e.message.split("\n")[0]); }
  finally {
    await browser.close();
    await admin.from("messes").delete().eq("id", mess.id);
    for (const id of [R, K, C]) await admin.auth.admin.deleteUser(id);
    console.log(`cleaned up\n\n${pass} passed, ${fail} failed`);
  }
})();
