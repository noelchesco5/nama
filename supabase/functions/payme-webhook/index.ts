// nama - Payme Africa webhook.
//
// Payme POSTs when a transaction reaches a final state. We verify the
// X-Middleware-Signature header (Base64(HMAC-SHA256(rawBody + X-Timestamp,
// shared secret))) and then credit the wallet exactly once through the
// existing idempotent approver. This is the automated replacement for manual
// HQ verification of top-ups.
//
// Must be deployed with verify_jwt = false (Payme cannot have a Supabase JWT).
// The caller is authenticated by verifying the signature header instead.
//
// Environment: PAYME_APP_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

async function verifySig(
  secret: string,
  rawBody: string,
  timestamp: string,
  signature: string,
): Promise<boolean> {
  if (!signature || !timestamp) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(rawBody + timestamp),
  );
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));
  // Constant-time-ish compare; lengths differ on junk anyway.
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const { PAYME_APP_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = Deno.env.toObject();
  if (!PAYME_APP_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'not configured' }, 500);
  }

  const rawBody = await req.text();
  const ok = await verifySig(
    PAYME_APP_SECRET,
    rawBody,
    req.headers.get('X-Timestamp') ?? '',
    req.headers.get('X-Middleware-Signature') ?? '',
  );
  if (!ok) return json({ error: 'invalid signature' }, 401);

  const evt = JSON.parse(rawBody) as {
    reference?: string;
    result?: string;
    payment_status?: string;
    amount?: string | number;
  };

  // Our references look like topup:<payment_request_id>.
  const requestId = evt.reference?.startsWith('topup:') ? evt.reference.slice(6) : null;
  if (!requestId) return json({ note: 'reference ignored' });

  if (evt.payment_status === 'COMPLETED') {
    // Idempotent: a completed transaction credited twice still credits once.
    // The amount posted is always the SERVICE-side amount from the request row.
    const { error } = await createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).rpc(
      '_apply_topup_approval',
      { p_request_id: requestId, p_note: 'payme auto-verified', p_reviewer: null },
    );
    if (error) return json({ error: error.message }, 500);
    return json({ note: 'credited' });
  }

  if (evt.payment_status === 'FAILED') {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    await admin
      .from('payment_requests')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString(), review_note: 'payme: payment failed' })
      .eq('id', requestId)
      .eq('status', 'pending'); // status guard: never overwrite a decided row
    return json({ note: 'marked rejected' });
  }

  return json({ note: 'pending' });
});
