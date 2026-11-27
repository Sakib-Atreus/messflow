const { chromium } = require("playwright");
const { createClient } = require("@supabase/supabase-js");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const BASE = process.env.E2E_BASE_URL || "http://localhost:3300", tag = Date.now() % 100000;
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  - " + x : ""}`); };
(async () => {
  const month = new Date(Date.now() + 6 * 36e5).toISOString().slice(0, 8) + "01";
  const users = [];
  const mk = async (n) => { const id = (await admin.auth.admin.createUser({ email: `zz.${n}.${tag}@users.messflow.app`, password: "verify-123", email_confirm: true, user_metadata: { full_name: n } })).data.user.id; users.push(id); return id; };
  const A = await mk("anika"), B = await mk("bappy");
  const { data: mess } = await admin.from("messes").insert({ name: `ZZ Prefs ${tag}`, created_by: A }).select("id").single();
  for (const [u, n] of [[A, "Anika"], [B, "Bappy"]]) await admin.from("mess_members").insert({ mess_id: mess.id, joined_on: month, user_id: u, display_name: n, role: "member", claim_code: null });
  await admin.from("profiles").update({ locale: "en" }).eq("id", A); // Anika chose English on another phone
  const b = await chromium.launch();
  const englishPhone = { locale: "en-US", extraHTTPHeaders: { "accept-language": "en-US,en;q=0.9" } };
  try {
    // 1) first visit on an English phone → Bangla
    let ctx = await b.newContext(englishPhone); let p = await ctx.newPage();
    await p.goto(BASE + "/", { waitUntil: "networkidle", timeout: 180000 });
    ok("first visit on an English-language phone opens in Bangla", p.url().endsWith("/bn"), p.url());
    // 2) switch to English, close the app, open again
    await p.locator("header").getByRole("button", { name: "English" }).click();
    await p.waitForURL(/\/en$/);
    const ck = (await ctx.cookies()).find((c) => c.name === "NEXT_LOCALE");
    ok("language choice is remembered for about a year", ck && ck.value === "en" && ck.expires * 1000 - Date.now() > 300 * 864e5, ck && `${ck.value}, ${Math.round((ck.expires * 1000 - Date.now()) / 864e5)} days`);
    const kept = (await ctx.cookies()).filter((c) => c.expires !== -1); // closing the browser drops session cookies
    await ctx.close();
    ctx = await b.newContext(englishPhone); await ctx.addCookies(kept); p = await ctx.newPage();
    await p.goto(BASE + "/", { waitUntil: "networkidle" });
    ok("after closing and reopening, it opens in English", p.url().endsWith("/en"), p.url());
    await ctx.close();
    // 3) installed app start address
    const mf = await (await fetch(BASE + "/manifest.webmanifest")).json();
    ok("installed app starts at / (follows the saved language)", mf.start_url === "/", mf.start_url);
    // 4) Anika logs in on a new phone (Bangla page) → her saved English
    ctx = await b.newContext(); p = await ctx.newPage();
    await p.goto(BASE + "/bn/login", { waitUntil: "networkidle" });
    await p.fill('input[name="email"]', `zz.anika.${tag}`); await p.fill('input[name="password"]', "verify-123");
    await p.click('button[type="submit"]'); await p.waitForURL(/dashboard/, { timeout: 120000 });
    ok("new phone: Anika's saved English is used after login", p.url().endsWith("/en/dashboard"), p.url());
    await ctx.close();
    // 5) Bappy (profile Bangla) picks English on the login page → stays English and it's saved
    ctx = await b.newContext(); p = await ctx.newPage();
    await p.goto(BASE + "/bn/login", { waitUntil: "networkidle" });
    await p.getByRole("button", { name: "English" }).click(); await p.waitForURL(/\/en\/login/);
    await p.fill('input[name="email"]', `zz.bappy.${tag}`); await p.fill('input[name="password"]', "verify-123");
    await p.click('button[type="submit"]'); await p.waitForURL(/dashboard/, { timeout: 120000 });
    const saved = (await admin.from("profiles").select("locale").eq("id", B).single()).data.locale;
    ok("choosing English on the login page keeps English and saves it", p.url().endsWith("/en/dashboard") && saved === "en", `${p.url()} profile=${saved}`);
    await ctx.close();
    // 6) theme follows the phone (System), live
    ctx = await b.newContext({ colorScheme: "dark" }); p = await ctx.newPage();
    await p.goto(BASE + "/bn", { waitUntil: "networkidle" });
    const dark1 = await p.evaluate(() => document.documentElement.classList.contains("dark"));
    await p.emulateMedia({ colorScheme: "light" }); await p.waitForTimeout(300);
    const dark2 = await p.evaluate(() => document.documentElement.classList.contains("dark"));
    await p.emulateMedia({ colorScheme: "dark" }); await p.waitForTimeout(300);
    const dark3 = await p.evaluate(() => document.documentElement.classList.contains("dark"));
    ok("theme follows the phone by default, and switches live (dark → light → dark)", dark1 && !dark2 && dark3, `${dark1} ${dark2} ${dark3}`);
    await ctx.close();
  } catch (e) { fail++; console.log("ERROR", e.message.split("\n")[0]); }
  finally {
    await b.close();
    await admin.from("messes").delete().eq("id", mess.id);
    for (const id of users) await admin.auth.admin.deleteUser(id);
    console.log(`cleaned up\n\n${pass} passed, ${fail} failed`);
  }
})();
