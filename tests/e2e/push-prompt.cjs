// "Turn on notifications" banner: shows after login, "Later" hides it for a few days, turning on registers the
// phone and hides it for good, blocked phones get an unblock note, iPhones outside the Home Screen an install
// note, khala gets her own wording. Headless Chromium has no real push service, so the phone's subscription is
// stood in for (the permission, the server action and the database row are real).
const { chromium } = require("playwright");
const { createClient } = require("@supabase/supabase-js");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const BASE = process.env.E2E_BASE_URL || "http://localhost:3300", tag = Date.now() % 100000;
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  - " + x : ""}`); };

// a stand-in push subscription that survives reloads (kept in localStorage), like a real phone's
const FAKE_PUSH = (endpoint) => {
  const KEY = "e2e-fake-sub";
  const sub = () => ({ endpoint, toJSON: () => ({ endpoint, keys: { p256dh: "e2e-p256dh", auth: "e2e-auth" } }), unsubscribe: async () => { localStorage.removeItem(KEY); return true; } });
  const pm = { getSubscription: async () => (localStorage.getItem(KEY) ? sub() : null), subscribe: async () => { localStorage.setItem(KEY, "1"); return sub(); } };
  // the phone's permission popup: "not asked yet" until the app asks, then the person taps "Allow"
  const PERM = "e2e-perm";
  try {
    Object.defineProperty(Notification, "permission", { get: () => localStorage.getItem(PERM) || "default", configurable: true });
    Notification.requestPermission = async () => { localStorage.setItem(PERM, "granted"); return "granted"; };
  } catch {}
  const patch = (reg) => { if (reg) Object.defineProperty(reg, "pushManager", { value: pm, configurable: true }); return reg; };
  if (navigator.serviceWorker) {
    const get = navigator.serviceWorker.getRegistration.bind(navigator.serviceWorker);
    const reg = navigator.serviceWorker.register.bind(navigator.serviceWorker);
    navigator.serviceWorker.getRegistration = async (...a) => patch(await get(...a));
    navigator.serviceWorker.register = async (...a) => patch(await reg(...a));
  }
};

(async () => {
  const month = new Date(Date.now() + 6 * 36e5).toISOString().slice(0, 8) + "01";
  const users = [];
  const mk = async (n) => { const id = (await admin.auth.admin.createUser({ email: `zz.${n}.${tag}@users.messflow.app`, password: "verify-123", email_confirm: true, user_metadata: { full_name: n } })).data.user.id; users.push(id); return id; };
  const R = await mk("rahim"), K = await mk("karim"), C = await mk("khala");
  const { data: mess } = await admin.from("messes").insert({ name: `ZZ Push ${tag}`, created_by: R }).select("id").single();
  const base = { mess_id: mess.id, joined_on: month, claim_code: null, default_lunch: true, default_dinner: true };
  await admin.from("mess_members").insert({ ...base, user_id: R, display_name: "Rahim", role: "manager" });
  await admin.from("mess_members").insert({ ...base, user_id: K, display_name: "Karim", role: "member" });
  await admin.from("mess_cooks").insert({ mess_id: mess.id, user_id: C, name: "Khala" });
  const b = await chromium.launch();
  const errs = [];
  const login = async (who, { lang = "bn", width = 390, init, ua, permissions = [] } = {}) => {
    const ctx = await b.newContext({ viewport: { width, height: 844 }, userAgent: ua, permissions });
    if (init) await ctx.addInitScript(init.fn, init.arg);
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(`${BASE}/${lang}/login`, { waitUntil: "networkidle" });
    await p.fill('input[name="email"]', `zz.${who}.${tag}`); await p.fill('input[name="password"]', "verify-123");
    await p.click('button[type="submit"]'); await p.waitForURL((x) => !x.pathname.endsWith("/login"));
    await ctx.addCookies([{ name: "mf_mess", value: mess.id, url: BASE }]);
    return p;
  };
  const banner = (p) => p.locator("[data-push-prompt]");
  try {
    // 1. member, first time: the banner asks; "Later" hides it, also after a reload
    const endpoint = `https://fcm.googleapis.com/fcm/send/e2e-${tag}`;
    const k = await login("karim", { init: { fn: FAKE_PUSH, arg: endpoint }, permissions: ["notifications"] });
    await k.goto(BASE + "/bn/dashboard", { waitUntil: "networkidle" });
    await banner(k).first().waitFor({ timeout: 15000 }).catch(() => {});
    const bt = await banner(k).first().innerText().catch(() => "");
    ok("member dashboard asks: নোটিফিকেশন চালু করুন + চালু করুন / পরে", (await banner(k).getAttribute("data-push-prompt")) === "off" && bt.includes("নোটিফিকেশন চালু করুন") && bt.includes("পরে"), bt.replace(/\n/g, " | "));
    await k.screenshot({ path: `${process.env.SP}/push-banner.png` });
    await banner(k).getByRole("button", { name: "পরে" }).click();
    ok("'পরে' hides it", (await banner(k).count()) === 0);
    await k.reload({ waitUntil: "networkidle" }); await k.waitForTimeout(800);
    ok("…and it stays hidden after a reload (asks again in a few days)", (await banner(k).count()) === 0);
    // 2. the few days pass → it asks again; one tap turns notifications on and registers this phone
    await k.evaluate(() => localStorage.setItem("mf-push-later", String(Date.now() - 1000)));
    await k.reload({ waitUntil: "networkidle" });
    await banner(k).first().waitFor({ timeout: 15000 });
    ok("after the snooze it asks again", (await banner(k).count()) === 1);
    await banner(k).getByRole("button", { name: "চালু করুন" }).click();
    await k.getByText("নোটিফিকেশন চালু হয়েছে").first().waitFor({ timeout: 15000 });
    const { data: subs } = await admin.from("push_subscriptions").select("user_id, endpoint").eq("endpoint", endpoint);
    ok("one tap: this phone is registered for Karim", subs?.length === 1 && subs[0].user_id === K, JSON.stringify(subs));
    ok("the banner is gone", (await banner(k).count()) === 0);
    await k.reload({ waitUntil: "networkidle" }); await k.waitForTimeout(1000);
    ok("…and never comes back once on", (await banner(k).count()) === 0);
    await k.goto(BASE + "/bn/more", { waitUntil: "networkidle" }); await k.waitForTimeout(800);
    ok("More → Notifications shows 'on' with all types ticked (turn off any time there)", (await k.locator("main").innerText()).includes("এই ডিভাইসে চালু আছে") && (await k.locator('main input[type="checkbox"]:checked').count()) >= 5);

    // 3. blocked in the phone's settings → a short note on how to unblock (no button)
    const blocked = { fn: () => { try { Object.defineProperty(Notification, "permission", { get: () => "denied" }); } catch {} }, arg: undefined };
    const r = await login("rahim", { init: blocked, lang: "en", width: 1280 });
    await r.goto(BASE + "/en/dashboard", { waitUntil: "networkidle" });
    await banner(r).first().waitFor({ timeout: 15000 }).catch(() => {});
    ok("blocked phone: unblock note instead of the button", (await banner(r).getAttribute("data-push-prompt").catch(() => null)) === "denied" && (await banner(r).innerText()).includes("blocked"));
    await banner(r).getByRole("button", { name: "OK" }).click();
    ok("…closing it hides it", (await banner(r).count()) === 0);

    // 4. iPhone in Safari (not on the Home Screen yet) → how to add it to the Home Screen
    const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
    const noPush = { fn: () => { try { delete window.PushManager; } catch {} }, arg: undefined };
    const ip = await login("rahim", { ua: iphone, init: noPush, lang: "en" });
    await ip.goto(BASE + "/en/dashboard", { waitUntil: "networkidle" });
    await banner(ip).first().waitFor({ timeout: 15000 }).catch(() => {});
    ok("iPhone outside the Home Screen: 'Add to Home Screen' note", (await banner(ip).getAttribute("data-push-prompt").catch(() => null)) === "ios-install" && (await banner(ip).innerText()).includes("Add to Home Screen"));

    // 5. khala's page asks too, with her own words
    const c = await login("khala", { init: { fn: FAKE_PUSH, arg: endpoint + "-k" }, permissions: ["notifications"] });
    await c.goto(BASE + "/bn/kitchen", { waitUntil: "networkidle" });
    await banner(c).first().waitFor({ timeout: 15000 }).catch(() => {});
    const ct = await banner(c).first().innerText().catch(() => "");
    ok("khala's page: banner with 'মেসের জরুরি খবর ফোনে পাবেন'", ct.includes("মেসের জরুরি খবর ফোনে পাবেন"), ct.replace(/\n/g, " | "));
    await banner(c).getByRole("button", { name: "চালু করুন" }).click();
    await c.getByText("নোটিফিকেশন চালু হয়েছে").first().waitFor({ timeout: 15000 });
    ok("khala can turn them on (her phone is registered)", ((await admin.from("push_subscriptions").select("user_id").eq("endpoint", endpoint + "-k")).data ?? [])[0]?.user_id === C);
    await c.screenshot({ path: `${process.env.SP}/push-kitchen.png` });
    ok("no page errors", errs.length === 0, errs.join(" | "));
  } catch (e) { fail++; console.log("ERROR", e.message.split("\n")[0]); }
  finally {
    await b.close();
    await admin.from("messes").delete().eq("id", mess.id);
    for (const id of users) await admin.auth.admin.deleteUser(id);
    console.log(`cleaned up\n\n${pass} passed, ${fail} failed`);
  }
})();
