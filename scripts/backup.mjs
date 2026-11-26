// Full data backup of the database in DATABASE_URL: every mess, member, meal, bazar, deposit, bill,
// month… plus the logins (auth.users / auth.identities, so passwords keep working after a restore).
// Writes one plain SQL file to backups/ (git-ignored). Read-only: it never changes the database.
//
//   pnpm db:backup        → live project (.env.production.local)
//   pnpm db:backup:dev    → development project (.env.local)
//
// Restore with `pnpm db:restore <file>` into a fresh project (see README → Backups).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL;
const label = process.argv[2] ?? "backup";
if (!url || url.includes("YOUR-PASSWORD")) {
  console.error("✗ Set DATABASE_URL (Supabase → Connect → Session pooler) in the env file first.");
  process.exit(1);
}
const v = spawnSync("pg_dump", ["--version"], { encoding: "utf8" });
if (v.error) {
  console.error("✗ pg_dump is not installed. On a Mac: brew install libpq && brew link --force libpq");
  process.exit(1);
}

const dir = path.resolve("backups");
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Dhaka" }).replace(" ", "_").replace(/:/g, "").slice(0, 15);
const file = path.join(dir, `messflow-${label}-${stamp}.sql`);

console.log(`Backing up (${label})…`);
const r = spawnSync(
  "pg_dump",
  [
    url,
    "--data-only", // the tables themselves come from supabase/migrations
    "--inserts", "--rows-per-insert=500", // plain INSERTs: readable and portable
    "--no-owner", "--no-privileges",
    "--table=public.*", "--table=private.*", "--table=auth.users", "--table=auth.identities",
    "--file", file,
  ],
  { encoding: "utf8", stdio: ["ignore", "inherit", "pipe"] },
);
if (r.status !== 0) {
  fs.rmSync(file, { force: true });
  console.error(`✗ Backup failed:\n${r.stderr}`);
  process.exit(1);
}

// a short summary so you can see the backup isn't empty
const client = new pg.Client({ connectionString: url, ssl: url.includes("localhost") || url.includes("127.0.0.1") ? false : { rejectUnauthorized: false } });
await client.connect();
const count = async (t) => (await client.query(`select count(*)::int n from ${t}`)).rows[0].n;
const summary = {
  messes: await count("public.messes"),
  members: await count("public.mess_members"),
  logins: await count("auth.users"),
  meals: await count("public.meals"),
  bazar: await count("public.bazar_entries"),
  deposits: await count("public.deposits"),
  "closed months": await count("public.months where status = 'closed'"),
};
await client.end();

const size = (fs.statSync(file).size / 1024).toFixed(0);
console.log(`✓ Saved ${path.relative(process.cwd(), file)} (${size} KB)`);
console.log("  " + Object.entries(summary).map(([k, n]) => `${n} ${k}`).join(" · "));
console.log("  Keep a copy somewhere safe (e.g. a private Google Drive folder). It contains personal data and login hashes.");
