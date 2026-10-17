#!/usr/bin/env node
// Creates the single HQ account (Nama, nama@nama.com).
// - Uses the GoTrue admin API (service_role) to create the auth user.
// - The signup trigger creates a 'client' role + profile automatically.
// - Then, via a trusted direct SQL connection, upgrades the role to 'hq'
//   and flags must_change_password.
// Run: node scripts/seed-hq.mjs

import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';
import { randomBytes } from 'node:crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DATABASE_URL = process.env.DATABASE_URL;
const HQ_EMAIL = process.env.HQ_EMAIL || 'nama@nama.com';
const HQ_DISPLAY_NAME = process.env.HQ_DISPLAY_NAME || 'Nama';

for (const [k, v] of Object.entries({
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
  DATABASE_URL,
})) {
  if (!v) {
    console.error(`Missing ${k}`);
    process.exit(1);
  }
}

const password =
  process.env.HQ_INITIAL_PASSWORD ||
  randomBytes(18).toString('base64url').replace(/[^A-Za-z0-9]/g, '').slice(0, 24);

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: HQ_EMAIL,
    password,
    email_confirm: true,
    user_metadata: { full_name: HQ_DISPLAY_NAME, intended_role: 'client' },
  });

  let userId;
  if (createErr) {
    if (!/already|exists/i.test(createErr.message)) {
      console.error('createUser failed:', createErr.message);
      process.exit(1);
    }
    const { data: list, error: listErr } = await admin.auth.admin.listUsers();
    if (listErr) {
      console.error('listUsers failed:', listErr.message);
      process.exit(1);
    }
    const existing = (list.users || []).find((u) => u.email === HQ_EMAIL);
    if (!existing) {
      console.error('HQ user exists but could not be listed');
      process.exit(1);
    }
    userId = existing.id;
    console.log(`HQ user already exists (${userId}); rotating password.`);
    const { error: pwErr } = await admin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
    if (pwErr) {
      console.error('updateUserById failed:', pwErr.message);
      process.exit(1);
    }
  } else {
    userId = created.user.id;
    console.log(`Created HQ user ${userId}`);
  }

  const db = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    const r1 = await db.query(
      `update public.user_roles
         set role = 'hq', granted_at = now()
       where user_id = $1
       returning role`,
      [userId]
    );
    if (r1.rowCount === 0) {
      // No trigger row (unexpected): insert explicitly.
      await db.query(
        `insert into public.user_roles (user_id, role) values ($1, 'hq')
         on conflict (user_id) do update set role = 'hq'`,
        [userId]
      );
    }

    const r2 = await db.query(
      `update public.profiles
         set display_name = $2, must_change_password = true
       where id = $1
       returning id`,
      [userId, HQ_DISPLAY_NAME]
    );
    if (r2.rowCount === 0) {
      await db.query(
        `insert into public.profiles (id, display_name, must_change_password)
         values ($1, $2, true)
         on conflict (id) do update set display_name = $2, must_change_password = true`,
        [userId, HQ_DISPLAY_NAME]
      );
    }
    console.log('HQ role and profile updated.');
  } finally {
    await db.end();
  }

  console.log('\n=== HQ credentials (store securely, never commit) ===');
  console.log(`Email:    ${HQ_EMAIL}`);
  console.log(`Password: ${password}`);
  console.log(`User ID:  ${userId}`);
  console.log(
    'Set HQ_INITIAL_PASSWORD in .env to this value for stable re-runs.'
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
