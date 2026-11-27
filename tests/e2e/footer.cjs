const { chromium } = require("playwright"); (async () => {
  const b = await chromium.launch();
  let pass = 0, fail = 0; const ok = (n, c, x = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  - " + x : ""}`); };
  for (const [w, h, scheme] of [[390, 844, "light"], [1280, 900, "light"], [1280, 900, "dark"]]) {
    const p = await (await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme })).newPage();
    const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto((process.env.E2E_BASE_URL || "http://localhost:3300") + "/bn", { waitUntil: "networkidle", timeout: 180000 });
    const f = p.locator("footer");
    await f.scrollIntoViewIfNeeded(); await p.waitForTimeout(300);
    const txt = await f.innerText();
    ok(`${w} ${scheme}: footer has অ্যাপ + সাহায্য columns, no GitHub`, txt.includes("অ্যাপ") && txt.includes("সাহায্য") && !/github/i.test(txt));
    ok(`${w} ${scheme}: no sideways scroll`, !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
    await f.screenshot({ path: `${process.env.SP}/landing/footer-${w}-${scheme}.png` });
    await f.getByRole("link", { name: "ফিচার" }).click(); await p.waitForTimeout(400);
    const top = await p.locator("#features").evaluate((el) => el.getBoundingClientRect().top);
    ok(`${w}: "ফিচার" jumps to the features section (below the navbar)`, top >= 0 && top < 120, `top=${Math.round(top)}`);
    ok(`${w}: no page errors`, errs.length === 0, errs.join(" | "));
  }
  await b.close(); console.log(`\n${pass} passed, ${fail} failed`);
})();
