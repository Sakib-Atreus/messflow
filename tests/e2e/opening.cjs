const { chromium } = require("playwright");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const BASE = process.env.E2E_BASE_URL || "http://localhost:3300", tag = Date.now() % 100000, OUT = process.env.SP + "/opening";
fs.mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  - " + x : ""}`); };
(async () => {
  const today = new Date(Date.now() + 6 * 36e5).toISOString().slice(0, 10), month = today.slice(0, 8) + "01";
  const prev = new Date(Date.parse(month) - 864e5).toISOString().slice(0, 8) + "01";
  const users = [];
  const mk = async (n) => { const id = (await admin.auth.admin.createUser({ email: `zz.${n}.${tag}@users.messflow.app`, password: "verify-123", email_confirm: true, user_metadata: { full_name: n } })).data.user.id; users.push(id); return id; };
  const R = await mk("rahim"), K = await mk("karim");
  const { data: mess } = await admin.from("messes").insert({ name: `ZZ Opening ${tag}`, created_by: R }).select("id").single();
  const ins = async (row) => (await admin.from("mess_members").insert({ mess_id: mess.id, joined_on: month, role: "member", claim_code: null, default_lunch: false, default_dinner: false, ...row }).select("id").single()).data.id;
  await ins({ user_id: R, display_name: "Rahim", role: "manager" });
  const mK = await ins({ user_id: K, display_name: "Karim" });
  await ins({ display_name: "Jamal" });
  const b = await chromium.launch();
  const errs = [];
  const login = async (who, width = 1280) => {
    const ctx = await b.newContext({ viewport: { width, height: 900 } }); const p = await ctx.newPage();
    p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(BASE + "/en/login", { waitUntil: "networkidle", timeout: 180000 });
    await p.fill('input[name="email"]', `zz.${who}.${tag}`); await p.fill('input[name="password"]', "verify-123");
    await p.click('button[type="submit"]'); await p.waitForURL((x) => !x.pathname.endsWith("/login"), { timeout: 120000 });
    await ctx.addCookies([{ name: "mf_mess", value: mess.id, url: BASE }]);
    return p;
  };
  try {
    const r = await login("rahim");
    await r.goto(BASE + "/en/dashboard", { waitUntil: "networkidle", timeout: 120000 });
    const step = r.getByRole("link", { name: /Old balances from your notebook/ });
    ok("setup checklist shows the optional notebook step", (await step.count()) === 1 && /optional/.test(await step.innerText()));
    await step.click(); await r.waitForURL(/\/members\?opening=1/);
    const dlg = r.locator("dialog[open]");
    await dlg.waitFor({ timeout: 30000 });
    ok("the link opens the Opening balance dialog straight away", (await dlg.innerText()).includes("Opening balance (from your notebook)"));
    await dlg.locator('tr[data-opening="Karim"] input[name^="due_"]').fill("1200");
    await dlg.locator('tr[data-opening="Jamal"] input[name^="credit_"]').fill("800");
    await r.screenshot({ path: `${OUT}/dialog.png` });
    await dlg.getByRole("button", { name: "Save opening balances" }).click();
    await r.getByText("Opening balances saved").first().waitFor({ timeout: 30000 });
    const { data: rows } = await admin.from("opening_balances").select("member_id, amount").eq("mess_id", mess.id);
    ok("saved: Karim −1200, Jamal +800", rows.length === 2 && rows.some((x) => x.member_id === mK && Number(x.amount) === -1200) && rows.some((x) => Number(x.amount) === 800), JSON.stringify(rows.map((x) => x.amount)));
    await r.goto(BASE + "/en/members", { waitUntil: "networkidle" });
    await r.getByRole("button", { name: "Opening balance" }).click();
    ok("reopening shows the saved amounts", (await r.locator('dialog[open] tr[data-opening="Karim"] input[name^="due_"]').inputValue()) === "1200");
    await r.goto(BASE + `/en/members/${mK}`, { waitUntil: "networkidle" });
    const pt = await r.locator("main").innerText();
    ok("Karim's bill shows 'Old due (from notebook) ৳1,200'", /Old due \(from notebook\)[\s\S]{0,80}৳1,200/.test(pt), pt.match(/Old due[^\n]*\n?[^\n]*/)?.[0]);
    await r.goto(BASE + "/en/sheet?tab=money", { waitUntil: "networkidle" });
    ok("monthly sheet column says 'Opening balance (notebook)'", /opening balance \(notebook\)/i.test(await r.locator("main").innerText()));
    await r.goto(BASE + "/en/costs", { waitUntil: "networkidle" });
    ok("bills total is untouched (no fake bill)", /Total bills\s*৳0/.test(await r.locator("main").innerText()));
    const k = await login("karim", 390);
    await k.goto(BASE + "/en/dashboard", { waitUntil: "networkidle" });
    const kt = await k.locator("main").innerText();
    ok("Karim's dashboard: owes ৳1,200 with the opening line", /You owe\s*৳1,200/.test(kt) && kt.includes("Opening balance (notebook)"), kt.match(/You owe\s*৳[\d,.]+/)?.[0]);
    await k.screenshot({ path: `${OUT}/karim-dashboard.png` });
    await k.goto(BASE + "/en/members", { waitUntil: "networkidle" });
    ok("members don't get the Opening balance button", (await k.getByRole("button", { name: "Opening balance" }).count()) === 0);
    // after the first month is closed it disappears
    await admin.from("months").insert({ mess_id: mess.id, month: prev, status: "closed" });
    await r.goto(BASE + "/en/members", { waitUntil: "networkidle" });
    ok("after a month is closed the button is gone", (await r.getByRole("button", { name: "Opening balance" }).count()) === 0);
    await r.goto(BASE + "/en/dashboard", { waitUntil: "networkidle" });
    ok("…and so is the checklist step", (await r.getByRole("link", { name: /Old balances from your notebook/ }).count()) === 0);
    await r.goto(BASE + "/bn/members", { waitUntil: "networkidle" });
    ok("no page errors", errs.length === 0, errs.join(" | "));
  } catch (e) { fail++; console.log("ERROR", e.message.split("\n")[0]); }
  finally {
    await b.close();
    await admin.from("messes").delete().eq("id", mess.id);
    for (const id of users) await admin.auth.admin.deleteUser(id);
    console.log(`cleaned up\n\n${pass} passed, ${fail} failed`);
  }
})();
