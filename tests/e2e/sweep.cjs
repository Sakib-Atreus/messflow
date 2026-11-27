// Visits every page as each role, phone + desktop, light + dark. Reports errors and layout problems.
const { chromium } = require("playwright");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const BASE = process.env.E2E_BASE_URL || "http://localhost:3300", tag = Date.now() % 100000, OUT = process.env.SP + "/sweep";
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const issues = []; let visits = 0;
(async () => {
  const today = new Date(Date.now() + 6 * 36e5).toISOString().slice(0, 10), month = today.slice(0, 8) + "01", nDays = Number(today.slice(8));
  const day = (d) => `${month.slice(0, 8)}${String(d).padStart(2, "0")}`;
  const tmr = new Date(Date.parse(today) + 864e5).toISOString().slice(0, 10);
  const mk = async (n, extra = {}) => (await admin.auth.admin.createUser({ email: `zz.${n}.${tag}@users.messflow.app`, password: "verify-123", email_confirm: true, user_metadata: { full_name: n }, ...extra })).data.user.id;
  const S = await mk("boss"); await admin.from("profiles").update({ is_super_admin: true }).eq("id", S);
  const R = await mk("rahim"), K = await mk("karim"), C = await mk("khala"), J = await mk("joiner");
  const { data: mess } = await admin.from("messes").insert({ name: "Green House Mess", created_by: R }).select("id, invite_code").single();
  const names = ["Rahim Uddin", "Karim Hasan", "Jamal Hossain", "Tanvir Ahmed", "Arif Rahman", "Nayeem Islam"];
  const ids = [];
  for (const [i, n] of names.entries()) {
    const row = { mess_id: mess.id, joined_on: month, display_name: n, default_lunch: true, default_dinner: true, phone: `017000000${10 + i}`, role: i === 0 ? "manager" : "member", user_id: i === 0 ? R : i === 1 ? K : null, claim_code: i < 2 ? null : undefined, room: `${100 + i}` };
    if (row.claim_code === undefined) delete row.claim_code;
    const { data, error } = await admin.from("mess_members").insert(row).select("id").single();
    if (error) throw new Error("member " + error.message); ids.push(data.id);
  }
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const meals = [];
  for (let d = 1; d <= nDays; d++) for (const id of ids) meals.push({ mess_id: mess.id, member_id: id, date: day(d), lunch: rnd() > 0.15, dinner: rnd() > 0.08, half_lunch: false, guest_lunch: d % 9 === 0 ? 1 : 0, source: "manager" });
  { const { error } = await admin.from("meals").insert(meals); if (error) throw new Error("meals " + error.message); }
  const bz = []; for (let d = 1; d <= nDays; d += 2) bz.push({ mess_id: mess.id, date: day(d), amount: Math.round(900 + rnd() * 1100), items: "Rice, dal, chicken", shopper_id: ids[(d >> 1) % ids.length] });
  await admin.from("bazar_entries").insert(bz);
  for (const [category, title, amount] of [["rent", "House rent", 27000], ["gas", "Gas", 1080], ["khala", "Khala (cook)", 4200]]) {
    const { data: fc } = await admin.from("fixed_costs").insert({ mess_id: mess.id, month, category, title, amount, repeat_monthly: true }).select("id").single();
    await admin.from("fixed_cost_shares").insert(ids.map((id) => ({ fixed_cost_id: fc.id, mess_id: mess.id, member_id: id, amount: amount / ids.length })));
  }
  await admin.from("deposits").insert(ids.map((id, i) => ({ mess_id: mess.id, member_id: id, amount: 6000 + i * 700, date: day(1 + i), status: "approved", method: ["cash", "bkash", "nagad"][i % 3] })));
  await admin.from("deposits").insert({ mess_id: mess.id, member_id: ids[1], amount: 1500, date: today, status: "pending", method: "bkash" });
  await admin.from("notices").insert({ mess_id: mess.id, title: "Water tank cleaning on Friday", body: "Please store some water on Thursday night.", pinned: true });
  await admin.from("bazar_roster").insert([{ mess_id: mess.id, date: today, member_id: ids[3] }, { mess_id: mess.id, date: tmr, member_id: ids[1] }]);
  await admin.from("mess_cooks").insert({ mess_id: mess.id, user_id: C, name: "Rina Khala" });
  await admin.from("meal_menus").insert({ mess_id: mess.id, date: today, lunch: "Rice, chicken curry, dal", dinner: "ভাত, মাছ, সবজি", note: "আজ রাতে ২ জন গেস্ট আসবে" });
  const { data: lv } = await admin.from("cook_leaves").insert({ mess_id: mess.id, date: tmr, meal: "lunch" }).select("id").single();
  await admin.from("cook_volunteers").insert({ leave_id: lv.id, mess_id: mess.id, member_id: ids[1] });
  await admin.from("join_requests").insert({ mess_id: mess.id, user_id: J, display_name: "New Joiner" }).then(() => {}, () => {});
  await admin.from("notifications").insert([{ user_id: K, title: "🍳 খালা ছুটিতে", body: "আগামীকাল দুপুর বন্ধ", url: "/bn/meals" }, { user_id: R, title: "🙋 Karim will cook", body: "Approve it on the Meals page", url: "/en/meals" }]);

  const browser = await chromium.launch();
  const app = ["/dashboard", "/meals", "/bazar", "/deposits", "/costs", "/members", `/members/${ids[1]}`, "/sheet", "/sheet?tab=bazar", "/sheet?tab=bills", "/sheet?tab=payments", "/sheet?tab=money", "/report", "/roster", "/notices", "/roles", "/settings", "/profile", "/more"];
  const roles = {
    manager: { who: "rahim", pages: app },
    member: { who: "karim", pages: app.filter((p) => !["/roles", "/settings"].includes(p)).concat(["/roles", "/settings"]) },
    khala: { who: "khala", pages: ["/kitchen", "/dashboard", "/members"] },
    superadmin: { who: "boss", pages: ["/admin", "/admin/messes", "/admin/users"] },
  };
  const views = [["phone", 390, 844, "light"], ["desktop", 1280, 900, "light"], ["phone-dark", 390, 844, "dark"]];
  const check = async (page) => page.evaluate(() => {
    const vw = innerWidth, out = [];
    if (document.documentElement.scrollWidth > vw + 1) out.push(`sideways scroll: page is ${document.documentElement.scrollWidth}px wide`);
    const clipped = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) return true; } return false; };
    const seen = new Set();
    for (const el of document.querySelectorAll("main *, header *, nav *")) {
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
      const st = getComputedStyle(el); if (st.visibility === "hidden" || st.position === "fixed") continue;
      if ((r.right > vw + 1 || r.left < -1) && !clipped(el)) { const k = `${el.tagName}.${(el.className || "").toString().slice(0, 40)}`; if (!seen.has(k)) { seen.add(k); out.push(`off-screen: <${el.tagName.toLowerCase()}> "${(el.innerText || "").trim().slice(0, 40)}" x=${Math.round(r.left)}..${Math.round(r.right)}`); } }
    }
    if (vw < 500) {
      let small = [];
      for (const el of document.querySelectorAll("main a, main button, main summary, main select, main input[type=checkbox]")) {
        const r = el.getBoundingClientRect(); if (!r.width) continue;
        if (r.height < 28 && r.width < 80) small.push(`"${(el.innerText || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 20)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      if (small.length) out.push(`small tap targets (${small.length}): ${small.slice(0, 4).join(", ")}`);
    }
    const txt = document.body.innerText;
    if (txt.includes("—")) out.push("em dash in text");
    const raw = txt.match(/\b(common|meals|members|leave|menu|kitchen|dashboard|errors|push|nav|cook|admin|settings)\.[a-zA-Z]+\b/g);
    if (raw) out.push(`raw translation keys: ${[...new Set(raw)].slice(0, 5).join(", ")}`);
    if (/NaN|undefined|\[object Object\]|Invalid Date/.test(txt)) out.push(`bad value in text: ${txt.match(/.{0,30}(NaN|undefined|\[object Object\]|Invalid Date).{0,20}/)?.[0]}`);
    return out;
  });
  for (const [role, cfg] of Object.entries(roles)) {
    for (const [vname, w, h, scheme] of views) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, isMobile: w < 500, hasTouch: w < 500 });
      const page = await ctx.newPage();
      const errs = [];
      page.on("pageerror", (e) => errs.push("pageerror: " + e.message.slice(0, 160)));
      page.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource.*(404|401)|Download the React DevTools/.test(m.text())) errs.push("console: " + m.text().slice(0, 160)); });
      await page.goto(BASE + "/en/login", { waitUntil: "networkidle", timeout: 180000 });
      await page.fill('input[name="email"]', `zz.${cfg.who}.${tag}`); await page.fill('input[name="password"]', "verify-123");
      await page.click('button[type="submit"]'); await page.waitForURL((x) => !x.pathname.endsWith("/login"), { timeout: 120000 });
      await ctx.addCookies([{ name: "mf_mess", value: mess.id, url: BASE }]);
      for (const lang of vname === "desktop" ? ["en", "bn"] : ["bn"]) for (const p of cfg.pages) {
        errs.length = 0;
        const res = await page.goto(`${BASE}/${lang}${p}`, { waitUntil: "networkidle", timeout: 120000 });
        await page.waitForTimeout(250);
        visits++;
        const label = `${role} ${vname} /${lang}${p}`;
        const status = res?.status();
        const found = await check(page, label);
        if (status && status >= 400) found.unshift(`HTTP ${status}`);
        if (/Something went wrong|Application error/.test(await page.locator("body").innerText())) found.unshift("error page shown");
        for (const f of [...found, ...errs]) issues.push(`${label}: ${f}`);
        const file = `${role}-${vname}-${lang}${p.replace(/[/?=]/g, "_")}.png`;
        await page.screenshot({ path: `${OUT}/${file}`, fullPage: true });
      }
      await ctx.close();
    }
  }
  await browser.close();
  await admin.from("messes").delete().eq("id", mess.id);
  for (const id of [S, R, K, C, J]) await admin.auth.admin.deleteUser(id);
  fs.writeFileSync(`${OUT}/issues.txt`, issues.join("\n"));
  console.log(`visited ${visits} page views, ${issues.length} issues\n` + issues.join("\n"));
})().catch(async (e) => { console.log("ERROR", e.message); });
