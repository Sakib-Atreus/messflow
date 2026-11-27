// Manager resets a member's password; safety block; backup card; month-close backup reminder.
const { chromium } = require("playwright");
const { createClient } = require("@supabase/supabase-js");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const BASE = process.env.E2E_BASE_URL || "http://localhost:3300", tag = Date.now() % 100000;
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  - " + x : ""}`); };
(async () => {
  const today = new Date(Date.now() + 6 * 36e5).toISOString().slice(0, 10), month = today.slice(0, 8) + "01";
  const last = new Date(Date.parse(month) - 864e5).toISOString().slice(0, 8) + "01";
  const users = [], messes = [];
  const mk = async (n) => { const id = (await admin.auth.admin.createUser({ email: `zz.${n}.${tag}@users.messflow.app`, password: "verify-123", email_confirm: true, user_metadata: { full_name: n } })).data.user.id; users.push(id); await admin.from("profiles").update({ username: `zz.${n}.${tag}` }).eq("id", id); return id; };
  const R = await mk("rahim"), K = await mk("karim"), D = await mk("dual"), S = await mk("boss");
  await admin.from("profiles").update({ is_super_admin: true }).eq("id", S);
  const newMess = async (name, by) => { const { data } = await admin.from("messes").insert({ name, created_by: by }).select("id").single(); messes.push(data.id); return data.id; };
  const m1 = await newMess(`ZZ Reset ${tag}`, R), m2 = await newMess(`ZZ Other ${tag}`, D);
  const ins = (mess, row) => admin.from("mess_members").insert({ mess_id: mess, joined_on: last, role: "member", claim_code: null, ...row });
  await ins(m1, { user_id: R, display_name: "Rahim", role: "manager" });
  await ins(m1, { user_id: K, display_name: "Karim" });
  await ins(m1, { user_id: D, display_name: "Dual" });
  await ins(m2, { user_id: D, display_name: "Dual", role: "manager" });
  const b = await chromium.launch();
  const errs = [];
  const login = async (who, pw = "verify-123", mess = m1) => {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage();
    p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(BASE + "/en/login", { waitUntil: "networkidle", timeout: 180000 });
    await p.fill('input[name="email"]', `zz.${who}.${tag}`); await p.fill('input[name="password"]', pw);
    await p.click('button[type="submit"]'); await p.waitForURL((x) => !x.pathname.endsWith("/login"), { timeout: 120000 });
    await ctx.addCookies([{ name: "mf_mess", value: mess, url: BASE }]);
    return p;
  };
  const row = (p, name) => p.locator("main li", { has: p.locator(`text="${name}"`) }).first();
  try {
    const r = await login("rahim");
    await r.goto(BASE + "/en/members", { waitUntil: "networkidle", timeout: 120000 });
    ok("manager sees 'Reset password' for Karim", (await row(r, "Karim").getByRole("button", { name: "Reset password" }).count()) === 1);
    ok("no 'Reset password' on the manager's own row", (await row(r, "Rahim").getByRole("button", { name: "Reset password" }).count()) === 0);
    await row(r, "Karim").getByRole("button", { name: "Reset password" }).click();
    const form = row(r, "Karim").locator("form", { has: r.locator('input[name="password"]') });
    await form.locator('input[name="password"]').fill("temp-4567");
    await form.getByRole("button", { name: "Reset password" }).click();
    await r.getByText("New temporary password").waitFor({ timeout: 30000 });
    ok("new temporary password shown to the manager", (await row(r, "Karim").innerText()).includes("temp-4567"));
    // Karim logs in with it → must set his own
    const k = await login("karim", "temp-4567");
    await k.waitForURL((x) => x.pathname.includes("change-password"), { timeout: 60000 }).catch(() => {});
    ok("Karim logs in with the temporary password and must choose a new one", k.url().includes("/change-password"), k.url());
    // Dual is also in another mess → blocked
    await r.goto(BASE + "/en/members", { waitUntil: "networkidle" });
    await row(r, "Dual").getByRole("button", { name: "Reset password" }).click();
    await row(r, "Dual").locator("form", { has: r.locator('input[name="password"]') }).getByRole("button", { name: "Reset password" }).click();
    await r.getByText("also in another mess").first().waitFor({ timeout: 30000 });
    ok("someone also in another mess can't be reset by this manager (and wasn't)", true);
    const still = await login("dual", "verify-123", m2);
    ok("Dual's password still works", !still.url().includes("change-password"), still.url());
    // backup card + month-close reminder
    const s = await login("boss");
    await s.goto(BASE + "/en/admin", { waitUntil: "networkidle" });
    const card = s.locator("section", { hasText: "Backup" }).first();
    ok("admin panel shows the backup card", /Last backup: .*days ago|No backup yet/.test(await card.innerText()), (await card.innerText()).replace(/\n/g, " | ").slice(0, 100));
    await r.goto(BASE + `/en/report?month=${last.slice(0, 7)}`, { waitUntil: "networkidle" });
    await r.getByRole("button", { name: "Close month" }).click();
    await r.locator("dialog[open]").last().getByRole("button").last().click();
    let inbox = [];
    for (let i = 0; i < 20 && !inbox.length; i++) { inbox = (await admin.from("notifications").select("title, body").eq("user_id", S)).data ?? []; if (!inbox.length) await new Promise((x) => setTimeout(x, 500)); }
    ok("closing a month reminds the super admin to back up", inbox.some((n) => /db:backup/.test(n.body) && n.body.includes(`ZZ Reset ${tag}`)), inbox[0]?.body);
    ok("no page errors", errs.length === 0, errs.join(" | "));
  } catch (e) { fail++; console.log("ERROR", e.message.split("\n")[0]); }
  finally {
    await b.close();
    for (const id of messes) await admin.from("messes").delete().eq("id", id);
    for (const id of users) await admin.auth.admin.deleteUser(id);
    console.log(`cleaned up\n\n${pass} passed, ${fail} failed`);
  }
})();
