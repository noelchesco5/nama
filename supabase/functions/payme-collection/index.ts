// nama - Payme Africa collection (USSD push) gate.
//
// The client asks to pay an existing pending top-up request by mobile money.
// TRUST RULES:
//   * The amount is read from the pending payment_request row - the client
//     never sends money amounts here.
//   * A request can be collected only once (idempotency reference
//     topup:<request_id>); Payme rejects duplicate references.
//   * The caller must be the request's owner (JWT verified).
//   * The secret lives only in edge env (PAYME_APP_SECRET), never in the app.
//
// Environment: PAYME_APP_ID, PAYME_APP_SECRET, PAYME_SANDBOX (set "1" for
// sandbox), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { paymeTransact } from '../_shared/payme.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BASE = 'https://portal.paymeafrica.com/api/v1';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const {
    PAYME_APP_ID,
    PAYME_APP_SECRET,
    PAYME_SANDBOX,
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
  } = Deno.env.toObject();
  if (!PAYME_APP_ID || !PAYME_APP_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'payme not configured on the server' }, 500);
  }

  // Identify the caller; reject anything that is not a signed-in user.
  const userClient = createClient(SUPABASE_URL, Deno.env.get('ANON_KEY') ?? '', {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: auth } = await userClient.auth.getUser();
  if (!auth?.user) return json({ error: 'not signed in' }, 401);

  const { payment_request_id, msisdn } = await req.json().catch(() => ({}));
  if (!payment_request_id || !msisdn) {
    return json({ error: 'payment_request_id and msisdn are required' }, 400);
  }
  const phone = String(msisdn).replace(/\D/g, '');
  if (!phone.startsWith('255') || phone.length !== 12) {
    return json({ error: 'msisdn must be 255XXXXXXXXX' }, 400);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Only the owner's PENDING request with a known amount can be collected.
  const { data: pr, error: prErr } = await admin
    .from('payment_requests')
    .select('id, user_id, amount_tzs, status')
    .eq('id', payment_request_id)
    .single();
  if (prErr || !pr) return json({ error: 'request not found' }, 404);
  if (pr.user_id !== auth.user.id) return json({ error: 'not your request' }, 403);
  if (pr.status !== 'pending') return json({ error: `request is ${pr.status}` }, 409);

  const reference = `topup:${pr.id}`;
  const result = await paymeTransact(PAYME_APP_ID, PAYME_APP_SECRET, {
    action: 'collection',
    amount: Math.floor(pr.amount_tzs),
    msisdn: phone,
    reference,
    callback_url: `${SUPABASE_URL}/functions/v1/payme-webhook`,
  }, PAYME_SANDBOX === '1');

  if (!result.ok) {
    return json(
      {
        error: result.message ?? 'payme rejected the request',
        note: 'no money moved; the request stays pending',
      },
      502,
    );
  }

  return json({
    status: result.status,
    payment_status: result.paymentStatus,
    transaction_id: result.transactionId,
    reference,
    note:
      result.paymentStatus === 'PENDING'
        ? 'Expect the USSD prompt on your phone. Confirm with your PIN. The wallet is credited automatically after payment.'
        : undefined,
  });
});
