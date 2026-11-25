// Applies supabase/migrations/*.sql to the database in DATABASE_URL, without the Supabase CLI.
// Each file runs once, in its own transaction. Applied files are recorded in the same table the
// Supabase CLI uses, so you can switch to `supabase db push` later without re-running anything.
// Usage: pnpm db:migrate
import fs from "node:fs";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url || url.includes("YOUR-PASSWORD")) {
  console.error("✗ Set DATABASE_URL in .env.local (Supabase → Connect → Session pooler).");
  process.exit(1);
}

const dir = new URL("../supabase/migrations/", import.meta.url);
const files = fs.readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();

let parsedHost = "";
try {
  parsedHost = new URL(url).hostname;
} catch {}
if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(parsedHost) && !url.includes("localhost")) {
  console.error(`✗ DATABASE_URL can't be read. Your database password probably contains characters like @ # / ? : $ !
  Easiest fix: Supabase → Project Settings → Database → Reset database password → "Generate a password"
  (letters and numbers only), then put it in DATABASE_URL.`);
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: url.includes("localhost") ? false : { rejectUnauthorized: false } });
try {
  await client.connect();
} catch (e) {
  const host = new URL(url).hostname;
  if (e.code === "ENOTFOUND" && host.startsWith("db.")) {
    console.error(`✗ Can't reach ${host}.
  That's the "Direct connection" address, which only works on IPv6 networks.
  In Supabase click Connect → choose "Session pooler" → copy that URI into DATABASE_URL in .env.local.`);
  } else if (e.code === "28P01" || /password authentication/i.test(e.message)) {
    console.error("✗ Wrong database password in DATABASE_URL. Reset it in Supabase → Project Settings → Database.");
  } else {
    console.error(`✗ Could not connect to the database: ${e.message}`);
  }
  process.exit(1);
}
try {
  await client.query(`
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (
      version text primary key, statements text[], name text
    );`);
  const { rows } = await client.query("select version from supabase_migrations.schema_migrations");
  const applied = new Set(rows.map((r) => r.version));

  let ran = 0;
  for (const file of files) {
    const [version, ...rest] = file.replace(/\.sql$/, "").split("_");
    if (applied.has(version)) {
      console.log(`  ✓ ${file} (already applied)`);
      continue;
    }
    const sql = fs.readFileSync(new URL(file, dir), "utf8");
    process.stdout.write(`  → ${file} … `);
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query(
        "insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)",
        [version, rest.join("_"), [sql]],
      );
      await client.query("commit");
      console.log("done");
      ran++;
    } catch (e) {
      await client.query("rollback");
      console.log("FAILED");
      console.error(`\n✗ ${e.message}${e.where ? `\n  at: ${e.where}` : ""}`);
      process.exit(1);
    }
  }
  console.log(ran ? `\n✓ Applied ${ran} migration(s).` : "\n✓ Database is up to date.");
} finally {
  await client.end();
}
