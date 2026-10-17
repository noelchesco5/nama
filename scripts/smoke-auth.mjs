#!/usr/bin/env node
// Phase 0 exit-criteria smoke test: three roles sign in and each sees only its
// own data. Mirrors what the real app does (anon key + user session).
//
// Requires:
//   SUPABASE_URL
//   SUPABASE_ANON_KEY        (the publishable/anon key; needed for the app path)
//   SUPABASE_SERVICE_ROLE_KEY (to create/delete test users)
//   DATABASE_URL             (optional; to set the hq role via trusted SQL)
//
// Creates three throwaway users, signs each in, decodes the JWT, and asserts
// row-level isolation through PostgREST. Cleans up after itself.

import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';

const {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  DATABASE_URL,
} = process.env;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    'Missing env. Need SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.'
  );
  process.exit(2);
}

const PASSWORD = 'Passw0rd!phase0';
const TEST = {
  client_a: { email: 'phase0.client.a@nama.test', role: 'client' },
  client_b: { email: 'phase0.client.b@nama.test', role: 'client' },
  specialist: { email: 'phase0.specialist@nama.test', role: 'specialist' },
  hq: { email: 'phase0.hq@nama.test', role: 'hq' },
};

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let failures = 0;
function check(name, cond, detail = '') {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.error(`  FAIL  ${name} ${detail}`);
  }
}

function decodeJwt(token) {
  const part = token.split('.')[1];
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

async function ensureUser(email, role) {
  const { error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: email.split('@')[0], intended_role: role === 'specialist' ? 'specialist' : 'client' },
  });
  if (error && !/already|exists/i.test(error.message)) {
    throw new Error(`createUser ${email}: ${error.message}`);
  }
}

async function findUser(email) {
  const { data, error } = await admin.auth.admin.listUsers();
  if (error) throw new Error(`listUsers: ${error.message}`);
  return (data.users || []).find((u) => u.email === email);
}

async function main() {
  console.log('Creating test users...');
  for (const [k, t] of Object.entries(TEST)) await ensureUser(t.email, t.role);

  // Set the hq role via trusted SQL if a direct DB URL is available.
  const hqUser = await findUser(TEST.hq.email);
  if (DATABASE_URL && hqUser) {
    const db = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
    await db.connect();
    try {
      await db.query(`update public.user_roles set role = 'hq' where user_id = $1`, [hqUser.id]);
    } finally {
      await db.end();
    }
  } else if (hqUser) {
    console.warn('No DATABASE_URL: cannot set hq role; hq checks may fail.');
  }

  const sessions = {};
  for (const [k, t] of Object.entries(TEST)) {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.signInWithPassword({
      email: t.email,
      password: PASSWORD,
    });
    if (error) throw new Error(`signIn ${t.email}: ${error.message}`);
    sessions[k] = { client, user: data.user, token: data.session.access_token };
    console.log(`Signed in ${k} (${t.email})`);
  }

  console.log('\nJWT user_role claim:');
  const hqClaims = decodeJwt(sessions.hq.token);
  const hookEnabled = 'user_role' in hqClaims;
  for (const [k, t] of Object.entries(TEST)) {
    const claims = decodeJwt(sessions[k].token);
    console.log(`  ${k}: user_role=${claims.user_role ?? '(missing)'} role=${claims.role}`);
  }
  if (!hookEnabled) {
    console.warn(
      '\n  note: Custom Access Token hook is not enabled. RLS is DB-authoritative\n' +
        '  so isolation still holds, but the app cannot read its role from the JWT.\n' +
        '  Optional: Authentication > Hooks > Custom Access Token ->\n' +
        '  pg-functions://postgres/public/custom_access_token_hook'
    );
  }

  console.log('\nRLS isolation via PostgREST (select own/all profiles):');
  for (const [k, t] of Object.entries(TEST)) {
    const { client, user } = sessions[k];
    const { data, error } = await client.from('profiles').select('id, display_name');
    if (error) {
      check(`${k} select profiles`, false, error.message);
      continue;
    }
    const ids = (data || []).map((r) => r.id);
    if (t.role === 'hq') {
      check(`${k} sees all profiles`, (data || []).length >= Object.keys(TEST).length);
    } else {
      check(
        `${k} sees only own profile`,
        ids.length === 1 && ids[0] === user.id,
        `saw ${ids.length} rows`
      );
    }
  }

  console.log('\nCleaning up test users...');
  for (const t of Object.values(TEST)) {
    const u = await findUser(t.email);
    if (u) await admin.auth.admin.deleteUser(u.id);
  }

  console.log(failures === 0 ? '\nSMOKE_PASSED' : `\nSMOKE_FAILED (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
