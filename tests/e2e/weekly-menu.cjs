// Weekly menu: manager writes Sat→Fri once; members + khala see the right day; a daily change wins for that day only.
const { chromium } = require("playwright");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const BASE = process.env.E2E_BASE_URL || "http://localhost:3300", tag = Date.now() % 100000, OUT = process.env.SP + "/weekly";
fs.mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  - " + x : ""}`); };
(async () => {
  const today = new Date(Date.now() + 6 * 36e5).toISOString().slice(0, 10), month = today.slice(0, 8) + "01";
  const tomorrow = new Date(Date.parse(today) + 864e5).toISOString().slice(0, 10);
  const wd = new Date(today + "T00:00:00Z").getUTCDay(), wdT = (wd + 1) % 7;
  const users = [];
  const mk = async (n) => { const id = (await admin.auth.admin.createUser({ email: `zz.${n}.${tag}@users.messflow.app`, password: "verify-123", email_confirm: true, user_metadata: { full_name: n } })).data.user.id; users.push(id); return id; };
  const R = await mk("rahim"), K = await mk("karim"), C = await mk("khala");
  const { data: mess } = await admin.from("messes").insert({ name: `ZZ Weekly ${tag}`, created_by: R }).select("id").single();
  const base = { mess_id: mess.id, joined_on: month, claim_code: null, default_lunch: true, default_dinner: true };
  await admin.from("mess_members").insert({ ...base, user_id: R, display_name: "Rahim", role: "manager" });
  await admin.from("mess_members").insert({ ...base, user_id: K, display_name: "Karim", role: "member" });
  await admin.from("mess_cooks").insert({ mess_id: mess.id, user_id: C, name: "Khala" });
  await admin.from("profiles").update({ locale: "bn" }).eq("id", C);
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
    // 1. manager writes the weekly menu once
    const r = await login("rahim");
    await r.goto(BASE + "/en/meals", { waitUntil: "networkidle" });
    await r.getByRole("button", { name: "Weekly menu" }).click();
    const dlg = r.locator("dialog[open]"); await dlg.waitFor();
    const order = await dlg.locator("[data-weekday]").evaluateAll((els) => els.map((e) => e.getAttribute("data-weekday")));
    ok("weekly dialog starts on Saturday and ends on Friday", order.join(",") === "6,0,1,2,3,4,5", order.join(","));
    ok("first row is Saturday", (await dlg.locator("[data-weekday]").first().innerText()).startsWith("Saturday"));
    await dlg.locator(`input[name="${wd}_lunch"]`).fill("Rice, chicken, dal");
    await dlg.locator(`input[name="${wd}_dinner"]`).fill("Rice, fish");
    await dlg.locator(`input[name="${wdT}_lunch"]`).fill("Khichuri, egg");
    await r.screenshot({ path: `${OUT}/weekly-dialog.png` });
    await dlg.getByRole("button", { name: "Save weekly menu" }).click();
    await r.getByText("Weekly menu saved").first().waitFor({ timeout: 30000 });
    const { data: rows } = await admin.from("weekly_menus").select("weekday, lunch, dinner").eq("mess_id", mess.id);
    ok("saved: 2 weekdays (empty days not stored)", rows.length === 2 && rows.some((x) => x.weekday === wd && x.lunch === "Rice, chicken, dal"), JSON.stringify(rows));

    // 2. today's daily boxes are empty with the weekly dishes as hints
    await r.goto(BASE + "/en/meals", { waitUntil: "networkidle" });
    const lunchBox = r.locator('form input[name="lunch"]').first();
    ok("daily box stays empty (nothing written for today)", (await lunchBox.inputValue()) === "");
    ok("daily box shows the weekly dish as a hint", (await lunchBox.getAttribute("placeholder")) === "Weekly: Rice, chicken, dal", await lunchBox.getAttribute("placeholder"));
    ok("help says empty boxes use the weekly menu", (await r.locator("main").innerText()).includes("Empty boxes use the weekly menu"));
    await r.goto(BASE + "/en/dashboard", { waitUntil: "networkidle" });
    ok("manager dashboard shows today's menu from the weekly menu", (await r.locator("main").innerText()).includes("Lunch: Rice, chicken, dal · Dinner: Rice, fish"));

    // 3. member sees it without anyone writing today's menu
    const k = await login("karim", "en", 390);
    await k.goto(BASE + "/en/dashboard", { waitUntil: "networkidle" });
    ok("member dashboard: today's menu", (await k.locator("main").innerText()).includes("Rice, chicken, dal"));
    await k.goto(BASE + "/en/meals", { waitUntil: "networkidle" });
    const card = k.locator("section", { hasText: "What to cook" });
    const ct = await card.innerText();
    ok("member meals page: dishes with a 'weekly' marker, read-only", ct.includes("Rice, fish") && /weekly/.test(ct) && (await card.locator("input").count()) === 0, ct.replace(/\n/g, " | ").slice(0, 120));
    await k.goto(BASE + `/en/meals?date=${tomorrow}`, { waitUntil: "networkidle" });
    ok("tomorrow shows tomorrow's weekday dish", (await k.locator("section", { hasText: "What to cook" }).innerText()).includes("Khichuri, egg"));
    await k.screenshot({ path: `${OUT}/member-meals.png`, fullPage: true });

    // 4. khala sees only today's dishes, in Bangla
    const c = await login("khala", "bn", 390);
    await c.goto(BASE + "/bn/kitchen", { waitUntil: "networkidle" });
    const kt = await c.locator("main").innerText();
    ok("khala's page: today's weekly dishes in Bangla", /ভাত/.test(kt) && /মুরগি/.test(kt) && /মাছ/.test(kt), kt.replace(/\n+/g, " | ").slice(0, 200));
    ok("khala's today cards don't mix in tomorrow's dish (it's only in the tomorrow card)", !/খিচুড়ি|Khichuri/.test(kt.split("আগামীকাল")[0]) && /খিচুড়ি/.test(await c.locator("section[data-tomorrow]").innerText()));
    await c.screenshot({ path: `${OUT}/kitchen.png`, fullPage: true });

    // 5. a change for today only: lunch differs, dinner stays weekly; next week is back to weekly
    await r.goto(BASE + "/en/meals", { waitUntil: "networkidle" });
    await r.locator('form input[name="lunch"]').first().fill("Polao, beef");
    await r.locator('form textarea[name="note"]').first().fill("আজ ২ জন গেস্ট");
    await r.getByRole("button", { name: "Save menu" }).click();
    await r.getByText("Menu saved").first().waitFor({ timeout: 30000 });
    await c.goto(BASE + "/bn/kitchen", { waitUntil: "networkidle" });
    const kt2 = await c.locator("main").innerText();
    ok("khala: today's lunch changed, dinner still from the weekly menu, note shown", /পোলাও/.test(kt2) && !/মুরগি/.test(kt2) && /মাছ/.test(kt2) && kt2.includes("আজ ২ জন গেস্ট"), kt2.replace(/\n+/g, " | ").slice(0, 220));
    await k.goto(BASE + "/en/meals", { waitUntil: "networkidle" });
    const ct2 = await k.locator("section", { hasText: "What to cook" }).innerText();
    ok("member: changed lunch has no 'weekly' marker, dinner still does", /Polao, beef\s*\n?\s*Dinner/.test(ct2) && /Rice, fish\s*weekly/.test(ct2), ct2.replace(/\n/g, " | ").slice(0, 140));
    const nextWeek = new Date(Date.parse(today) + 7 * 864e5).toISOString().slice(0, 10);
    await k.goto(BASE + `/en/meals?date=${nextWeek}`, { waitUntil: "networkidle" });
    ok("next week the same day is back to the weekly menu", (await k.locator("section", { hasText: "What to cook" }).innerText()).includes("Rice, chicken, dal"));

    // 6. member can't open the weekly editor; Bangla labels
    await k.goto(BASE + "/en/meals", { waitUntil: "networkidle" });
    ok("members have no 'Weekly menu' button", (await k.getByRole("button", { name: "Weekly menu" }).count()) === 0);
    await r.goto(BASE + "/bn/meals", { waitUntil: "networkidle" });
    await r.getByRole("button", { name: "সাপ্তাহিক মেনু" }).click();
    const bt = await r.locator("dialog[open]").innerText();
    ok("Bangla: সাপ্তাহিক মেনু, starts with শনিবার", bt.includes("সাপ্তাহিক মেনু (শনি → শুক্র)") && /শনিবার/.test(bt.split("\n").find((l) => /বার$/.test(l.trim())) ?? ""), bt.split("\n").slice(0, 4).join(" | "));
    await r.screenshot({ path: `${OUT}/weekly-dialog-bn.png` });
    // clearing a weekday removes it
    await r.locator(`dialog[open] input[name="${wdT}_lunch"]`).fill("");
    await r.locator("dialog[open]").getByRole("button", { name: "সাপ্তাহিক মেনু সেভ করুন" }).click();
    await r.waitForTimeout(2500);
    const { data: rows2 } = await admin.from("weekly_menus").select("weekday").eq("mess_id", mess.id);
    ok("clearing a weekday removes it", rows2.length === 1 && rows2[0].weekday === wd, JSON.stringify(rows2));
    ok("no page errors", errs.length === 0, errs.join(" | "));
  } catch (e) { fail++; console.log("ERROR", e.message.split("\n")[0]); }
  finally {
    await b.close(); await admin.from("messes").delete().eq("id", mess.id);
    for (const id of users) await admin.auth.admin.deleteUser(id);
    console.log(`cleaned up\n\n${pass} passed, ${fail} failed`);
  }
})();
