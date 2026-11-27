// Browser tests: drive a running MessFlow in Chromium (Playwright) the way people use it.
//
//   pnpm build && pnpm start -p 3300     (in another terminal; a production build catches the most)
//   pnpm test:e2e                        all main tests
//   pnpm test:e2e cook leave             only these
//   pnpm test:e2e all                    also the full page sweep and the speed report
//
// The tests create their own "ZZ …" messes and "zz.<name>.<number>" logins in the DEVELOPMENT database
// (.env.local) and delete them again. They refuse to run against the live database.
// Point them at another server with E2E_BASE_URL=http://localhost:3000.
// First time on a machine: pnpm exec playwright install chromium
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const MAIN = [
  "stuck-saves", "speed-safety", "temp-password", "weekly-menu", "week-view", "cook", "leave", "needs",
  "opening", "reset-password", "theme", "language", "bell", "landing", "footer", "cursor",
];
const EXTRA = ["sweep", "speed"]; // every page × role × screen (slow), and a timing report
const dir = path.resolve("tests/e2e");
const out = path.join(dir, ".output");
const base = process.env.E2E_BASE_URL || "http://localhost:3300";

const args = process.argv.slice(2);
const names = args.length === 0 ? MAIN : args.includes("all") ? [...MAIN, ...EXTRA] : args;
const unknown = names.filter((n) => !fs.existsSync(path.join(dir, `${n}.cjs`)));
if (unknown.length) {
  console.error(`✗ Unknown test: ${unknown.join(", ")}. Available: ${[...MAIN, ...EXTRA].join(", ")}`);
  process.exit(1);
}

// never against the live database
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!url || !process.env.SUPABASE_SECRET_KEY) {
  console.error("✗ .env.local needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (development project).");
  process.exit(1);
}
const prodEnv = ".env.production.local";
if (fs.existsSync(prodEnv)) {
  const live = fs.readFileSync(prodEnv, "utf8").match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)?.[1]?.trim();
  if (live && live === url.trim()) {
    console.error("✗ .env.local points at the LIVE database. These tests create and delete test accounts - use the development project.");
    process.exit(1);
  }
}

// the app must already be running
try {
  const res = await fetch(`${base}/en/login`, { redirect: "manual" });
  if (res.status >= 500) throw new Error(`status ${res.status}`);
} catch (e) {
  console.error(`✗ Nothing answering at ${base} (${e.message}).\n  Start the app first: pnpm build && pnpm start -p 3300   (or set E2E_BASE_URL)`);
  process.exit(1);
}

fs.mkdirSync(out, { recursive: true });
console.log(`Browser tests against ${base} (database: ${new URL(url).hostname.split(".")[0]})\n`);
const results = [];
for (const name of names) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(dir, `${name}.cjs`)], {
    env: { ...process.env, E2E_BASE_URL: base, SP: out },
    encoding: "utf8",
    timeout: 15 * 60_000,
  });
  const text = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const secs = Math.round((Date.now() - t0) / 1000);
  let ok, summary;
  const counts = text.match(/(\d+) passed, (\d+) failed/g)?.pop()?.match(/(\d+) passed, (\d+) failed/);
  const saves = text.match(/SUMMARY (\d+)\/(\d+)/);
  if (name === "speed") {
    ok = r.status === 0;
    summary = (text.match(/average\s+\d+/)?.[0] ?? "").replace(/\s+/, " ") + " ms server time per page";
  } else if (name === "sweep") {
    const real = (text.match(/^.*issues?.*$/m)?.[0] ?? "") && text.split("\n").filter((l) => l.includes(": ") && !l.includes("small tap targets") && !l.startsWith("visited"));
    ok = r.status === 0 && /visited \d+ page views/.test(text) && real.length === 0;
    summary = text.match(/visited \d+ page views/)?.[0] ?? "did not finish";
  } else if (saves) {
    ok = saves[1] === saves[2];
    summary = `${saves[1]}/${saves[2]} saves finished`;
  } else if (counts) {
    ok = counts[2] === "0" && r.status === 0;
    summary = `${counts[1]} passed, ${counts[2]} failed`;
  } else {
    ok = false;
    summary = "no result (crashed?)";
  }
  results.push({ name, ok });
  console.log(`${ok ? "✓" : "✗"} ${name.padEnd(15)} ${summary}  (${secs}s)`);
  if (!ok) {
    const lines = text.split("\n").filter((l) => /^(FAIL|ERROR)|Error:|rror:/.test(l)).slice(0, 8);
    for (const l of lines.length ? lines : text.trim().split("\n").slice(-6)) console.log(`    ${l.slice(0, 220)}`);
    if (/Executable doesn't exist|playwright install/.test(text)) console.log("    → run: pnpm exec playwright install chromium");
  }
}
const failed = results.filter((r) => !r.ok).map((r) => r.name);
console.log(`\n${results.length - failed.length}/${results.length} test files passed${failed.length ? ` - failed: ${failed.join(", ")}` : ""}`);
console.log(`Screenshots: ${path.relative(process.cwd(), out)}/`);
process.exit(failed.length ? 1 : 0);
