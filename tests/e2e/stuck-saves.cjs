const { chromium } = require("playwright");
const { createClient } = require("@supabase/supabase-js");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const BASE = process.env.E2E_BASE_URL || "http://localhost:3300", tag = Date.now() % 100000;
(async () => {
  const month = new Date(Date.now() + 6 * 36e5).toISOString().slice(0, 8) + "01";
  const mk = async (n) => (await admin.auth.admin.createUser({ email: `zz.${n}.${tag}@users.messflow.app`, password: "verify-123", email_confirm: true })).data.user.id;
  const R = await mk("r"), K = await mk("k");
  const { data: m } = await admin.from("messes").insert({ name: `ZZ MS ${tag}`, created_by: R }).select("id").single();
  await admin.from("mess_members").insert({ mess_id: m.id, joined_on: month, role: "manager", claim_code: null, user_id: R, display_name: "Rahim" });
  await admin.from("mess_members").insert({ mess_id: m.id, joined_on: month, role: "member", claim_code: null, user_id: K, display_name: "Karim" });
  for (let i = 1; i <= 6; i++) await admin.from("mess_members").insert({ mess_id: m.id, joined_on: month, role: "member", claim_code: null, display_name: "Extra " + i });
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const results = [];
  const watch = async (label, submit) => {
    await submit();
    let res = "STUCK";
    for (let i = 1; i <= 40; i++) { await p.waitForTimeout(1000); if (!(await p.locator('button[aria-busy="true"]').count())) { res = "ok " + i + "s"; break; } }
    results.push(res); console.log(label.padEnd(36), res);
  };
  try {
    await p.goto(BASE + "/en/login"); await p.fill('input[name="email"]', `zz.r.${tag}`); await p.fill('input[name="password"]', "verify-123");
    await p.click('button[type="submit"]'); await p.waitForURL((x) => !x.pathname.endsWith("/login"));
    await p.context().addCookies([{ name: "mf_mess", value: m.id, url: BASE }]);
    const fresh = () => p.goto(BASE + "/en/members", { waitUntil: "networkidle" });
    const karim = () => p.locator("li", { hasText: "Karim" }).first();
    for (let round = 1; round <= (Number(process.env.ROUNDS) || 2); round++) {
      await fresh(); await karim().getByRole("button", { name: "Edit" }).click();
      await watch(`edit member #${round}`, () => karim().locator('form button[type="submit"]:visible').first().click());
      await fresh(); await karim().getByRole("button", { name: "Reset password" }).click();
      await karim().locator('input[name="password"]:visible').fill("reset-123");
      await watch(`reset password #${round}`, () => karim().locator('form button[type="submit"]:visible').first().click());
    }
  } catch (e) { console.log("ERROR", e.message.split("\n")[0]); results.push("ERROR"); }
  finally {
    await b.close(); await admin.from("messes").delete().eq("id", m.id);
    await admin.auth.admin.deleteUser(R); await admin.auth.admin.deleteUser(K);
    console.log(`SUMMARY ${results.filter((r) => r.startsWith("ok")).length}/${results.length} saves finished`);
  }
})();
