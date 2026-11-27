const { chromium } = require("playwright"); (async () => {
  const b = await chromium.launch();
  let pass = 0, fail = 0; const ok = (n, c, x = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  - " + x : ""}`); };
  const state = (p) => p.evaluate(() => ({ dark: document.documentElement.classList.contains("dark"), theme: document.documentElement.dataset.theme, saved: localStorage.getItem("theme"), lang: document.documentElement.lang }));
  for (const start of ["/en", "/en/login"]) {
    for (const want of ["dark", "light"]) {
      const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: want === "dark" ? "light" : "dark" });
      const p = await ctx.newPage();
      await p.goto((process.env.E2E_BASE_URL || "http://localhost:3300") + start, { waitUntil: "networkidle", timeout: 180000 });
      await p.evaluate((t) => window.__setTheme(t), want);
      await p.reload({ waitUntil: "networkidle" });
      const before = await state(p);
      await p.locator("header, main").getByRole("button", { name: /বাংলা|English/ }).first().click();
      await p.waitForFunction(() => document.documentElement.lang === "bn", null, { timeout: 30000 });
      await p.waitForTimeout(800);
      const after = await state(p);
      ok(`${start}: ${want} stays ${want} after switching to Bangla`, after.dark === (want === "dark") && after.theme === want, `before ${JSON.stringify(before)} after ${JSON.stringify(after)}`);
      await p.locator("header, main").getByRole("button", { name: /বাংলা|English/ }).first().click();
      await p.waitForFunction(() => document.documentElement.lang === "en", null, { timeout: 30000 });
      await p.waitForTimeout(800);
      const back = await state(p);
      ok(`${start}: ${want} stays ${want} after switching back to English`, back.dark === (want === "dark") && back.theme === want, JSON.stringify(back));
      await ctx.close();
    }
  }
  await b.close(); console.log(`\n${pass} passed, ${fail} failed`);
})();
