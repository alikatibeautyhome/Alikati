#!/usr/bin/env node
/**
 * Create (or update) the shop owner's admin account in Supabase.
 *
 *   node scripts/create-admin.mjs --email=owner@example.com --password='…' --name="Nirmala Khadka"
 *   node scripts/create-admin.mjs --email=owner@example.com --password='…' --promote-only
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the environment or from
 * `.env.local`. The service-role key is required: creating users is an admin-only operation.
 *
 * The account gets a `profiles` row with role `admin`, which is what unlocks pricing, settings,
 * staff management and media deletion in the console. Storefront customers live in a separate
 * table (`customers`) and can never reach /admin.
 *
 * ⚠ Keep the password out of git — pass it on the command line or from your own password
 *   manager, and change it after the first sign-in.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* ─────────────────────────────────────────────── environment loading */

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    out[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const fileEnv = { ...loadEnvFile(resolve(ROOT, '.env.local')), ...loadEnvFile(resolve(ROOT, '.env')) };
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || fileEnv.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY;

/* ─────────────────────────────────────────────────────────── arguments */

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    return [key, rest.join('=').replace(/^["']|["']$/g, '') || 'true'];
  })
);

const email = args.get('email')?.trim().toLowerCase();
const password = args.get('password');
const fullName = args.get('name') ?? 'Shop Owner';
const promoteOnly = args.has('promote-only');

if (!email || (!password && !promoteOnly)) {
  console.error(
    'Usage: node scripts/create-admin.mjs --email=<email> --password=<password> [--name="Full Name"]\n' +
      '       node scripts/create-admin.mjs --email=<email> --promote-only'
  );
  process.exit(1);
}

if (password && password.length < 10) {
  console.error('Refusing to set a password shorter than 10 characters.');
  process.exit(1);
}

if (!url || !serviceKey) {
  console.error(
    '\nCannot continue: Supabase is not configured.\n' +
      'Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.local first\n' +
      '(Supabase dashboard → Project Settings → API).\n\n' +
      'Without Supabase the app runs in demo mode; the demo admin login is\n' +
      'admin@alikati.demo / demo1234 — no setup required.\n'
  );
  process.exit(1);
}

/* ────────────────────────────────────────────────────────────── run */

const { createClient } = await import('@supabase/supabase-js');
const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let userId = null;

if (!promoteOnly) {
  // Create the user, or find the existing one so this script is safe to re-run.
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role: 'admin' },
  });

  if (createError) {
    const alreadyExists = /already|registered|exists/i.test(createError.message);

    if (!alreadyExists) {
      console.error(`✖ Could not create the user: ${createError.message}`);
      process.exit(1);
    }

    console.log(`• ${email} already exists — updating the password instead.`);
    const { data: list } = await supabase.auth.admin.listUsers({ perPage: 200 });
    const existing = list?.users?.find((user) => user.email?.toLowerCase() === email);
    if (!existing) {
      console.error('✖ The account exists but could not be located. Check the Supabase dashboard.');
      process.exit(1);
    }
    userId = existing.id;

    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: 'admin' },
    });
    if (updateError) {
      console.error(`✖ Could not update the password: ${updateError.message}`);
      process.exit(1);
    }
  } else {
    userId = created?.user?.id ?? null;
    console.log(`✔ Auth user created for ${email}`);
  }
} else {
  const { data: list } = await supabase.auth.admin.listUsers({ perPage: 200 });
  const existing = list?.users?.find((user) => user.email?.toLowerCase() === email);
  if (!existing) {
    console.error(`✖ No account found for ${email}.`);
    process.exit(1);
  }
  userId = existing.id;
}

/* ── profile row with the admin role (this is what unlocks the console) ── */

const { error: profileError } = await supabase
  .from('profiles')
  .upsert(
    { id: userId, email, full_name: fullName, role: 'admin' },
    { onConflict: 'id' }
  );

if (profileError) {
  console.error(`✖ Auth user is ready, but promoting the profile failed: ${profileError.message}`);
  console.error('  Run the SQL manually:');
  console.error(`  UPDATE public.profiles SET role = 'admin' WHERE email = '${email}';`);
  process.exit(1);
}

console.log(`✔ ${email} is now an admin.`);
console.log('\nSign in at /login — then change the password from the Supabase dashboard.');
