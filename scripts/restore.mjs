// Loads a backup made by `pnpm db:backup` into the database in DATABASE_URL.
// Only for a FRESH project: create a new Supabase project, run the migrations on it first
// (pnpm db:migrate / db:migrate:prod), then restore. Refuses if the database already has data.
//
//   pnpm db:restore <file>        → development project (.env.local)
//   pnpm db:restore:prod <file>   → live project (.env.production.local)
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import readline from "node:readline/promises";
import pg from "pg";

const url = process.env.DATABASE_URL;
const file = process.argv[2];
if (!url || url.includes("YOUR-PASSWORD")) {
  console.error("✗ Set DATABASE_URL in the env file first.");
  process.exit(1);
}
if (!file || !fs.existsSync(file)) {
  console.error("✗ Usage: pnpm db:restore backups/messflow-….sql");
  process.exit(1);
}
if (spawnSync("psql", ["--version"]).error) {
  console.error("✗ psql is not installed. On a Mac: brew install libpq && brew link --force libpq");
  process.exit(1);
}

const local = url.includes("localhost") || url.includes("127.0.0.1");
const client = new pg.Client({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false } });
await client.connect();
const { rows: tables } = await client.query("select count(*)::int n from information_schema.tables where table_schema = 'public' and table_name = 'messes'");
if (!tables[0].n) {
  console.error("✗ This database has no MessFlow tables yet. Run the migrations on it first (pnpm db:migrate).");
  process.exit(1);
}
const { rows } = await client.query("select (select count(*) from public.messes)::int messes, (select count(*) from auth.users)::int users");
await client.end();
if (rows[0].messes || rows[0].users) {
  console.error(`✗ This database already has data (${rows[0].messes} messes, ${rows[0].users} users).`);
  console.error("  Restore only into a fresh project, so nothing gets overwritten or mixed.");
  process.exit(1);
}

const host = new URL(url).hostname;
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const answer = await rl.question(`Restore ${file} into ${host}? Type RESTORE to continue: `);
rl.close();
if (answer.trim() !== "RESTORE") {
  console.log("Cancelled.");
  process.exit(0);
}

// one transaction: either everything loads or nothing does. Triggers are paused while loading
// (session_replication_role = replica) so rows keep their original values.
const r = spawnSync(
  "psql",
  [url, "-v", "ON_ERROR_STOP=1", "--single-transaction", "-q", "-c", "SET session_replication_role = replica", "-f", file],
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
);
if (r.status !== 0) {
  console.error(`✗ Restore failed, nothing was changed:\n${r.stderr}`);
  process.exit(1);
}
console.log("✓ Restored. Log in to check, then set up Authentication → URL Configuration and private.config again (see README).");
