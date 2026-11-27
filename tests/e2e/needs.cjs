// বাজারে লাগবে: khala taps items + writes + records voice → manager/duty notified → Bazar list → bought.
const { chromium } = require("playwright");
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const BASE = process.env.E2E_BASE_URL || "http://localhost:3300", tag = Date.now() % 100000, OUT = process.env.SP + "/needs";
fs.mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  - " + x : ""}`); };
(async () => {
  const today = new Date(Date.now() + 6 * 36e5).toISOString().slice(0, 10), month = today.slice(0, 8) + "01";
  const users = [];
  const mk = async (n) => { const id = (await admin.auth.admin.createUser({ email: `zz.${n}.${tag}@users.messflow.app`, password: "verify-123", email_confirm: true, user_metadata: { full_name: n } })).data.user.id; users.push(id); return id; };
  const R = await mk("rahim"), K = await mk("karim"), T = await mk("tanvir"), C = await mk("khala");
  const { data: mess } = await admin.from("messes").insert({ name: `ZZ Needs ${tag}`, created_by: R }).select("id").single();
  const ins = async (row) => (await admin.from("mess_members").insert({ mess_id: mess.id, joined_on: month, role: "member", ...row }).select("id").single()).data.id;
  await ins({ user_id: R, display_name: "Rahim", role: "manager", claim_code: null });
  await ins({ user_id: K, display_name: "Karim", claim_code: null });
  const mT = await ins({ user_id: T, display_name: "Tanvir", claim_code: null });
  await admin.from("mess_cooks").insert({ mess_id: mess.id, user_id: C, name: "Rina Khala" });
  await admin.from("bazar_roster").insert({ mess_id: mess.id, date: today, member_id: mT });
  const browser = await chromium.launch({
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  });
  const errs = [];
  const login = async (who, width = 390) => {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, permissions: ["microphone"] });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto(BASE + "/en/login", { waitUntil: "networkidle", timeout: 180000 });
    await page.fill('input[name="email"]', `zz.${who}.${tag}`); await page.fill('input[name="password"]', "verify-123");
    await page.click('button[type="submit"]'); await page.waitForURL((x) => !x.pathname.endsWith("/login"), { timeout: 120000 });
    await ctx.addCookies([{ name: "mf_mess", value: mess.id, url: BASE }]);
    return page;
  };
  try {
    const c = await login("khala");
    await c.goto(BASE + "/bn/kitchen", { waitUntil: "networkidle", timeout: 120000 });
    ok("khala sees 'বাজারে লাগবে' with item buttons", (await c.locator("main").innerText()).includes("বাজারে লাগবে") && (await c.locator("[data-need]").count()) === 16);
    ok("Send is disabled until something is chosen", await c.getByRole("button", { name: "পাঠান" }).isDisabled());
    await c.locator('[data-need="oil"]').click();
    await c.locator('[data-need="salt"]').click();
    ok("tapped items show a tick", (await c.locator('[data-need="oil"]').getAttribute("aria-pressed")) === "true");
    await c.getByPlaceholder("যেমন: কাঁচা মরিচ, ধনেপাতা").fill("কাঁচা মরিচ আর ধনেপাতা");
    await c.getByRole("button", { name: "ভয়েস রেকর্ড" }).click();
    await c.getByText("রেকর্ড হচ্ছে").waitFor({ timeout: 10000 });
    await c.waitForTimeout(2200);
    await c.getByRole("button", { name: /রেকর্ড হচ্ছে/ }).click();
    await c.locator("main audio").waitFor({ timeout: 10000 });
    ok("voice recorded, can be played back before sending", (await c.locator("main audio").count()) === 1);
    await c.screenshot({ path: `${OUT}/khala-before-send.png`, fullPage: true });
    await c.getByRole("button", { name: "পাঠান" }).click();
    await c.getByText("পাঠানো হয়েছে!").waitFor({ timeout: 30000 });
    const { data: rows } = await admin.from("bazar_needs").select("item, note, voice_path, status").eq("mess_id", mess.id);
    ok("saved: oil, salt, and the note + voice", rows.length === 3 && rows.some((r) => r.item === "oil") && rows.some((r) => r.note === "কাঁচা মরিচ আর ধনেপাতা" && r.voice_path?.startsWith(mess.id + "/")), JSON.stringify(rows.map((r) => [r.item, r.note, !!r.voice_path])));
    const vp = rows.find((r) => r.voice_path)?.voice_path;
    const { data: file } = await admin.storage.from("voice").download(vp);
    ok("voice file is stored", file && file.size > 500, `${file?.size} bytes, ${file?.type}`);
    await c.reload({ waitUntil: "networkidle" });
    ok("sent items now show ⏳ and can't be sent again", (await c.locator('[data-need="oil"]').innerText()).includes("⏳") && await c.locator('[data-need="oil"]').isDisabled());
    await c.screenshot({ path: `${OUT}/khala-after-send.png`, fullPage: true });
    let inbox = [];
    for (let i = 0; i < 20 && inbox.length < 2; i++) { inbox = (await admin.from("notifications").select("user_id, title, body").in("user_id", [R, T, K])).data ?? []; if (inbox.length < 2) await new Promise((r) => setTimeout(r, 500)); }
    ok("manager notified", inbox.some((n) => n.user_id === R && /Rina Khala: (তেল, লবণ|Oil, Salt)/.test(n.title)), inbox.find((n) => n.user_id === R)?.title);
    ok("today's bazar duty (Tanvir) notified", inbox.some((n) => n.user_id === T));
    ok("other members not notified", !inbox.some((n) => n.user_id === K));

    const k = await login("karim", 1280);
    await k.goto(BASE + "/bn/bazar", { waitUntil: "networkidle" });
    const list = k.locator("section", { hasText: "খালা এগুলো চেয়েছেন" });
    const lt = await list.innerText();
    ok("every member sees the list on Bazar (3 items)", lt.includes("তেল") && lt.includes("লবণ") && lt.includes("কাঁচা মরিচ আর ধনেপাতা") && /\(৩\)|\(3\)/.test(lt), lt.slice(0, 80).replace(/\n/g, " | "));
    ok("voice message playable on the Bazar page", (await list.locator("audio").count()) === 1 && /token=/.test(await list.locator("audio").getAttribute("src")));
    await k.screenshot({ path: `${OUT}/bazar-list.png`, fullPage: true });
    await list.locator('li[data-need-row="oil"]').getByRole("button", { name: "কেনা হয়েছে" }).click();
    await k.getByText("কেনা হয়েছে হিসেবে চিহ্নিত").waitFor({ timeout: 30000 });
    ok("member ticks oil as bought", (await admin.from("bazar_needs").select("status").eq("mess_id", mess.id).eq("item", "oil").single()).data.status === "bought");
    await c.reload({ waitUntil: "networkidle" });
    ok("khala's oil button is normal again (salt still ⏳)", !(await c.locator('[data-need="oil"]').innerText()).includes("⏳") && (await c.locator('[data-need="salt"]').innerText()).includes("⏳"));
    ok("no page errors", errs.length === 0, errs.join(" | "));
  } catch (e) { fail++; console.log("ERROR", e.message.split("\n")[0]); }
  finally {
    await browser.close();
    const { data: files } = await admin.storage.from("voice").list(mess.id);
    if (files?.length) await admin.storage.from("voice").remove(files.map((f) => `${mess.id}/${f.name}`));
    await admin.from("messes").delete().eq("id", mess.id);
    for (const id of users) await admin.auth.admin.deleteUser(id);
    console.log(`cleaned up\n\n${pass} passed, ${fail} failed`);
  }
})();
