const { chromium } = require("playwright");
const { createClient } = require("@supabase/supabase-js");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const BASE = process.env.E2E_BASE_URL || "http://localhost:3300", tag = Date.now() % 100000;
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  - " + x : ""}`); };
(async () => {
  const month = new Date(Date.now() + 6 * 36e5).toISOString().slice(0, 8) + "01";
  const users = [], messes = [];
  const mk = async (n) => { const id = (await admin.auth.admin.createUser({ email: `zz.${n}.${tag}@users.messflow.app`, password: "verify-123", email_confirm: true, user_metadata: { full_name: n } })).data.user.id; users.push(id); return id; };
  const R = await mk("rahim"), K = await mk("karim"), B = await mk("bablu");
  const mess = async (name) => { const { data } = await admin.from("messes").insert({ name, created_by: R }).select("id").single(); messes.push(data.id); return data.id; };
  const A = await mess(`ZZ Alpha ${tag}`), Z = await mess(`ZZ Zulu ${tag}`);
  const ins = (row) => admin.from("mess_members").insert({ joined_on: month, role: "member", claim_code: null, default_lunch: true, default_dinner: true, ...row });
  await ins({ mess_id: A, user_id: R, display_name: "Rahim Alpha", role: "manager" });
  await ins({ mess_id: Z, user_id: R, display_name: "Rahim Zulu", role: "manager" });
  await ins({ mess_id: A, user_id: K, display_name: "Karim Kumar" });
  await ins({ mess_id: A, user_id: B, display_name: "Bablu Bepari" });
  const b = await chromium.launch();
  const errs = [];
  const newPage = async () => { const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message)); return p; };
  const login = async (p, who) => {
    await p.goto(BASE + "/en/login", { waitUntil: "networkidle" });
    await p.fill('input[name="email"]', `zz.${who}.${tag}`); await p.fill('input[name="password"]', "verify-123");
    await p.click('button[type="submit"]'); await p.waitForURL((x) => !x.pathname.endsWith("/login"), { timeout: 60000 });
  };
  // counts page-data requests (React Server Component fetches) while doing something
  const rscDuring = async (p, fn) => { let n = 0; const h = (r) => { if (r.headers()["rsc"] === "1" && !r.headers()["next-router-prefetch"]) n++; }; p.on("request", h); await fn(); await p.waitForTimeout(400); p.off("request", h); return n; };
  const navTo = async (p, path) => { await p.locator(`aside a[href="/en${path}"], nav a[href="/en${path}"]`).first().click(); await p.waitForURL(`**/en${path}`); await p.locator("main").first().waitFor(); };
  try {
    const p = await newPage();
    await login(p, "rahim");
    await p.context().addCookies([{ name: "mf_mess", value: A, url: BASE }]);
    await p.goto(BASE + "/en/dashboard", { waitUntil: "networkidle" });
    // 1. tab cache: second visit within 30 s needs no new page load
    const first = await rscDuring(p, () => navTo(p, "/meals"));
    await navTo(p, "/dashboard");
    const again = await rscDuring(p, () => navTo(p, "/meals"));
    ok("first visit to Meals loads it from the server", first >= 1, `requests: ${first}`);
    ok("going back to Meals within 30 s is instant (no server load)", again === 0, `requests: ${again}`);
    // 2. your own change refreshes the cached pages
    await navTo(p, "/dashboard");
    // switching mess (a save) must drop every cached page: do it and come back to Meals
    // switching saves the choice, then reloads the whole page for the new mess: wait for that reload
    // (the dropdown itself shows the new name instantly, before the page has reloaded)
    const reloaded = p.waitForEvent("load", { timeout: 30000 });
    await p.locator("header select").selectOption(Z);
    await reloaded;
    await p.waitForLoadState("networkidle");
    ok("switching mess reloads the page for the new mess", (await p.locator("header select").inputValue()) === Z && (await p.locator("main").innerText()).length > 0);
    const afterSwitch = await rscDuring(p, () => navTo(p, "/meals"));
    const mealsText = await p.locator("main").innerText();
    ok("after switching mess, Meals loads fresh (not the old mess's page)", afterSwitch >= 1, `requests: ${afterSwitch}`);
    ok("…and shows the new mess's people", mealsText.includes("Rahim Zulu") && !mealsText.includes("Karim Kumar"));
    // 3. a save (meal toggle) refreshes cached pages
    await p.context().addCookies([{ name: "mf_mess", value: A, url: BASE }]);
    await p.goto(BASE + "/en/dashboard", { waitUntil: "networkidle" });
    await navTo(p, "/meals");
    await navTo(p, "/dashboard");
    await navTo(p, "/meals");
    const toggle = p.locator("main button[aria-pressed]:not([disabled])").first();
    await toggle.click(); await p.waitForLoadState("networkidle"); await p.waitForTimeout(1500);
    const afterSave = await rscDuring(p, () => navTo(p, "/dashboard"));
    ok("after a save, other pages load fresh", afterSave >= 1, `requests: ${afterSave}`);
    // 4. sign out clears it: next person on the same phone sees only their own things
    await p.locator('header button[title="Sign out"]').click();
    await p.waitForURL("**/en/login");
    await login(p, "karim");
    await p.goto(BASE + "/en/dashboard", { waitUntil: "networkidle" });
    const k1 = await rscDuring(p, () => navTo(p, "/meals"));
    const header = await p.locator("header").innerText();
    ok("after sign out + another login, pages load fresh", k1 >= 1, `requests: ${k1}`);
    ok("…and show the new person, not the previous one", header.includes("Karim Kumar") && !header.includes("Rahim"));
    // 5. blocking works on the next tap
    const q = await newPage();
    await login(q, "bablu");
    await q.goto(BASE + "/en/dashboard", { waitUntil: "networkidle" });
    ok("Bablu is in before the block", q.url().endsWith("/en/dashboard"));
    await admin.auth.admin.updateUserById(B, { ban_duration: "876000h" });
    await admin.from("profiles").update({ blocked: true }).eq("id", B);
    await q.goto(BASE + "/en/meals", { waitUntil: "networkidle" });
    ok("after the super admin blocks him, the next page sends him to login", q.url().includes("/en/login"), q.url());
    await q.fill('input[name="email"]', `zz.bablu.${tag}`); await q.fill('input[name="password"]', "verify-123");
    await q.click('button[type="submit"]'); await q.waitForTimeout(3000);
    ok("…and he can't sign in again", q.url().includes("/en/login"));
    ok("no page errors", errs.length === 0, errs.join(" | "));
  } catch (e) { fail++; console.log("ERROR", e.message.split("\n")[0]); }
  finally {
    await b.close();
    for (const id of messes) await admin.from("messes").delete().eq("id", id);
    for (const id of users) await admin.auth.admin.deleteUser(id);
    console.log(`cleaned up\n\n${pass} passed, ${fail} failed`);
  }
})();
