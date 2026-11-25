// Creates the super admin account (or promotes an existing one). Run once after migrating.
// Usage: pnpm admin:create
import readline from "node:readline/promises";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key || url.includes("YOUR-PROJECT")) {
  console.error("✗ Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local first.");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false } });

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const email = (await rl.question("Super admin email: ")).trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("✗ That doesn't look like an email.");
  process.exit(1);
}
const { data: found } = await admin.rpc("find_user_by_email", { p_email: email });
let id = found?.[0]?.id;

if (id) {
  console.log("This account already exists — it will be made super admin (password unchanged).");
} else {
  const name = (await rl.question("Your name: ")).trim() || "Admin";
  const password = (await rl.question("Password (min 8 characters, shown while typing): ")).trim();
  if (password.length < 8) {
    console.error("✗ Password too short.");
    process.exit(1);
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name, locale: "bn" },
  });
  if (error) {
    console.error(`✗ ${error.message}`);
    process.exit(1);
  }
  id = data.user.id;
}
rl.close();

const { error } = await admin.from("profiles").update({ is_super_admin: true, must_change_password: false }).eq("id", id);
if (error) {
  console.error(`✗ ${error.message}\n  Did you run "pnpm db:migrate" first?`);
  process.exit(1);
}
console.log(`\n✓ ${email} is now super admin. Log in and you'll land on the admin panel.`);
