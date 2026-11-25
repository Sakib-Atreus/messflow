// Deletes ALL app data (messes, members, meals, bazar, deposits, notices, requests, ...) and every user
// account EXCEPT super admins, from the database in DATABASE_URL. Tables, functions and settings stay.
// Usage: pnpm db:reset-data
import readline from "node:readline/promises";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url || url.includes("YOUR-PASSWORD")) {
  console.error("✗ Set DATABASE_URL in .env.local first.");
  process.exit(1);
}
const host = new URL(url).username + "@" + new URL(url).hostname;

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
  const count = async (sql) => Number((await client.query(sql)).rows[0].n);
  const users = await count("select count(*) n from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id and p.is_super_admin)");
  const keep = await count("select count(*) n from public.profiles where is_super_admin");
  const messes = await count("select count(*) n from public.messes");
  console.log(`\nDatabase: ${host}`);
  console.log(`This will permanently delete ${users} account(s), ${messes} mess(es) and all their data.`);
  console.log(`Super admin accounts are kept (${keep}).\n`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('Type DELETE to continue: ');
  rl.close();
  if (answer.trim() !== "DELETE") {
    console.log("Cancelled. Nothing was deleted.");
    process.exit(0);
  }

  await client.query("begin");
  // closed months lock their meals/bazar/deposits; unlock so they can be deleted
  await client.query("update public.months set status = 'open' where status = 'closed'");
  // messes cascade to members, meals, bazar, deposits, costs, months, notices, roster, logs
  await client.query("delete from public.messes");
  await client.query("delete from public.audit_log");
  // users cascade to profiles, requests and push subscriptions; super admins stay
  await client.query(
    "delete from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id and p.is_super_admin)",
  );
  await client.query("commit");
  console.log("\n✓ All data and accounts deleted (super admins kept). The app is ready for real use.");
} catch (e) {
  await client.query("rollback").catch(() => {});
  console.error(`✗ ${e.message}`);
  process.exit(1);
} finally {
  await client.end();
}
