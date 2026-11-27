const { chromium } = require("playwright");
const { createClient } = require("@supabase/supabase-js");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const BASE = process.env.E2E_BASE_URL || "http://localhost:3300", tag = Date.now() % 100000;
let pass = 0, fail = 0; const ok = (n, c, x = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  - " + x : ""}`); };
(async () => {
  const month = new Date(Date.now() + 6 * 36e5).toISOString().slice(0, 8) + "01";
  const U = (await admin.auth.admin.createUser({ email: `zz.temp.${tag}@users.messflow.app`, password: "temp-1234", email_confirm: true })).data.user.id;
  await admin.from("profiles").update({ must_change_password: true }).eq("id", U);
  const { data: m } = await admin.from("messes").insert({ name: `ZZ Temp ${tag}`, created_by: U }).select("id").single();
  await admin.from("mess_members").insert({ mess_id: m.id, joined_on: month, role: "member", claim_code: null, user_id: U, display_name: "Secret Name Tmp" });
  const b = await chromium.launch();
  try {
    const p = await (await b.newContext()).newPage();
    const seen = []; p.on("response", async (r) => { if (r.request().resourceType() === "document" || r.request().headers()["rsc"] || r.request().headers()["next-action"]) { const t = await r.text().catch(() => ""); if (t.includes("Secret Name Tmp")) seen.push(r.url()); } });
    await p.goto(BASE + "/en/login"); await p.fill('input[name="email"]', `zz.temp.${tag}`); await p.fill('input[name="password"]', "temp-1234");
    await p.click('button[type="submit"]'); await p.waitForURL((x) => !x.pathname.endsWith("/login")); await p.waitForLoadState("networkidle");
    ok("after sign-in a temporary-password account ends on Change password", p.url().endsWith("/en/change-password"), p.url());
    for (const path of ["/en/dashboard", "/en/meals", "/en/members"]) {
      await p.goto(BASE + path, { waitUntil: "networkidle" });
      ok(`opening ${path} directly still goes to Change password`, p.url().endsWith("/en/change-password"), p.url());
    }
    ok("no mess data was ever sent to the browser before the password change", seen.length === 0, seen.join(", "));
  } catch (e) { fail++; console.log("ERROR", e.message.split("\n")[0]); }
  finally { await b.close(); await admin.from("messes").delete().eq("id", m.id); await admin.auth.admin.deleteUser(U); console.log(`${pass} passed, ${fail} failed`); }
})();
