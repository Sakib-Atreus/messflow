// Khala sees tomorrow's menu; members see this week's menu (Sat → Fri, read-only).
const { chromium } = require("playwright");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const BASE = process.env.E2E_BASE_URL || "http://localhost:3300", tag = Date.now() % 100000, OUT = process.env.SP + "/weekview";
fs.mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  - " + x : ""}`); };
(async () => {
  const today = new Date(Date.now() + 6 * 36e5).toISOString().slice(0, 10), month = today.slice(0, 8) + "01";
  const tomorrow = new Date(Date.parse(today) + 864e5).toISOString().slice(0, 10);
  const wd = new Date(today + "T00:00:00Z").getUTCDay(), wdT = (wd + 1) % 7;
  const sat = new Date(Date.parse(today) - ((wd + 1) % 7) * 864e5).toISOString().slice(0, 10);
  const users = [];
  const mk = async (n) => { const id = (await admin.auth.admin.createUser({ email: `zz.${n}.${tag}@users.messflow.app`, password: "verify-123", email_confirm: true, user_metadata: { full_name: n } })).data.user.id; users.push(id); return id; };
  const R = await mk("rahim"), K = await mk("karim"), C = await mk("khala");
  const { data: mess } = await admin.from("messes").insert({ name: `ZZ Week ${tag}`, created_by: R }).select("id").single();
  const base = { mess_id: mess.id, joined_on: month, claim_code: null, default_lunch: true, default_dinner: true };
  await admin.from("mess_members").insert({ ...base, user_id: R, display_name: "Rahim", role: "manager" });
  await admin.from("mess_members").insert({ ...base, user_id: K, display_name: "Karim", role: "member" });
  await admin.from("mess_cooks").insert({ mess_id: mess.id, user_id: C, name: "Khala" });
  await admin.from("weekly_menus").insert([
    { mess_id: mess.id, weekday: wd, lunch: "Rice, chicken, dal", dinner: "Rice, fish" },
    { mess_id: mess.id, weekday: wdT, lunch: "Khichuri, egg", dinner: "Rice, beef" },
  ]);
  await admin.from("meal_menus").insert({ mess_id: mess.id, date: today, lunch: "Polao, beef" });
  await admin.from("cook_leaves").insert({ mess_id: mess.id, date: tomorrow, meal: "dinner", created_by: R });
  const b = await chromium.launch();
  const errs = [];
  const login = async (who, lang = "en", width = 1280) => {
    const ctx = await b.newContext({ viewport: { width, height: 900 } }); const p = await ctx.newPage();
    p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(`${BASE}/${lang}/login`, { waitUntil: "networkidle" });
    await p.fill('input[name="email"]', `zz.${who}.${tag}`); await p.fill('input[name="password"]', "verify-123");
    await p.click('button[type="submit"]'); await p.waitForURL((x) => !x.pathname.endsWith("/login"));
    await ctx.addCookies([{ name: "mf_mess", value: mess.id, url: BASE }]);
    return p;
  };
  try {
    // khala: tomorrow's menu card
    const c = await login("khala", "bn", 390);
    await c.goto(BASE + "/bn/kitchen", { waitUntil: "networkidle" });
    const tm = c.locator("section[data-tomorrow]");
    ok("khala sees a 'আগামীকাল' card", (await tm.count()) === 1);
    const tt = await tm.innerText();
    ok("tomorrow: lunch dishes in Bangla", /আগামীকাল/.test(tt) && /খিচুড়ি/.test(tt) && /ডিম/.test(tt), tt.replace(/\n+/g, " | "));
    ok("tomorrow: dinner shows her leave instead of dishes", /ছুটি - রান্না নেই/.test(tt) && !/গরুর মাংস/.test(tt));
    const todayPart = (await c.locator("main").innerText()).split("আগামীকাল")[0];
    ok("today's cooking stays first and unchanged (today's polao)", /পোলাও/.test(todayPart) && !/খিচুড়ি/.test(todayPart));
    await c.screenshot({ path: `${OUT}/kitchen-tomorrow.png`, fullPage: true });
    // nothing set for tomorrow → no card
    await admin.from("weekly_menus").delete().eq("mess_id", mess.id).eq("weekday", wdT);
    await admin.from("cook_leaves").delete().eq("mess_id", mess.id);
    await c.reload({ waitUntil: "networkidle" });
    ok("no card when tomorrow has nothing set", (await c.locator("section[data-tomorrow]").count()) === 0);
    await admin.from("weekly_menus").insert({ mess_id: mess.id, weekday: wdT, lunch: "Khichuri, egg", dinner: "Rice, beef" });

    // member: this week's menu
    const k = await login("karim", "en", 1280);
    await k.goto(BASE + "/en/meals", { waitUntil: "networkidle" });
    await k.getByRole("button", { name: "This week's menu" }).click();
    const dlg = k.locator("dialog[open]"); await dlg.waitFor(); await k.waitForTimeout(500);
    const days = await dlg.locator("li[data-day]").evaluateAll((els) => els.map((e) => e.getAttribute("data-day")));
    ok("7 days, Saturday → Friday of this week", days.length === 7 && days[0] === sat, days.join(","));
    ok("first row is Saturday", (await dlg.locator("li[data-day]").first().innerText()).startsWith("Saturday"));
    const todayRow = await dlg.locator(`li[data-day="${today}"]`).innerText();
    ok("today is marked and shows today's real menu (changed lunch + weekly dinner)", todayRow.includes("Today") && todayRow.includes("Polao, beef") && todayRow.includes("Rice, fish"), todayRow.replace(/\n/g, " | "));
    if (days.includes(tomorrow)) ok("tomorrow shows its weekly dishes", (await dlg.locator(`li[data-day="${tomorrow}"]`).innerText()).includes("Khichuri, egg"));
    const all = await dlg.innerText();
    ok("only the menu: no advice text, no inputs or buttons besides Close", !/turn|skip|don't like|off/i.test(all) && (await dlg.locator("input, textarea").count()) === 0 && (await dlg.locator("button").count()) === 1, all.slice(0, 80).replace(/\n/g, " | "));
    await k.screenshot({ path: `${OUT}/member-week-desktop.png` });
    const k2 = await login("karim", "bn", 390);
    await k2.goto(BASE + "/bn/meals", { waitUntil: "networkidle" });
    await k2.getByRole("button", { name: "এই সপ্তাহের মেনু" }).click();
    const bt = await k2.locator("dialog[open]").innerText();
    ok("Bangla: এই সপ্তাহের মেনু, starts শনিবার, today = আজ, dishes in Bangla", bt.includes("এই সপ্তাহের মেনু") && bt.split("\n").some((l) => l.startsWith("শনিবার")) && bt.includes("আজ") && /পোলাও/.test(bt), bt.split("\n").slice(0, 6).join(" | "));
    await k2.waitForTimeout(500); await k2.screenshot({ path: `${OUT}/member-week-phone.png` });

    // manager keeps the editor and doesn't get the member view
    const r = await login("rahim");
    await r.goto(BASE + "/en/meals", { waitUntil: "networkidle" });
    ok("manager: 'Weekly menu' editor, no 'This week's menu' view", (await r.getByRole("button", { name: "Weekly menu" }).count()) === 1 && (await r.getByRole("button", { name: "This week's menu" }).count()) === 0);
    ok("no page errors", errs.length === 0, errs.join(" | "));
  } catch (e) { fail++; console.log("ERROR", e.message.split("\n")[0]); }
  finally {
    await b.close(); await admin.from("messes").delete().eq("id", mess.id);
    for (const id of users) await admin.auth.admin.deleteUser(id);
    console.log(`cleaned up\n\n${pass} passed, ${fail} failed`);
  }
})();
