# nama - Deploy the Payme functions + test automated top-ups in sandbox

This is the exact, copy-paste path to go from "code is on GitHub" to "a real
USSD prompt appears on a phone and the wallet credits itself". Do it once and
the app needs no manual HQ review for top-ups any more.

If any step fails, check TROUBLESHOOTING at the bottom before retrying.

---

## 0. Prerequisites (2 minutes)

- A local clone of this repo: `git clone https://github.com/noelchesco5/nama`
- `cp .env.example .env` and fill in:
  - `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `PAYME_APP_ID=NAMA_TEST_APP`, `PAYME_APP_SECRET` (the WuLMRcA4... key),
    `PAYME_SANDBOX=1` while testing
- `pnpm install`
- A Supabase **access token** (`sbp_...`): dashboard → Account → Access
  Tokens → Generate. Put it in `.env` as `SUPABASE_ACCESS_TOKEN=...`.
  (The `sb_secret_...` API key is NOT this — see keys-and-decisions note I-004.)

All commands below run from the repo root.

---

## 1. Deploy the two edge functions (2 minutes)

```bash
set -a; source .env; set +a
pnpm exec supabase functions deploy payme-collection --project-ref "$SUPABASE_PROJECT_REF"
pnpm exec supabase functions deploy payme-webhook       --project-ref "$SUPABASE_PROJECT_REF" --no-verify-jwt
```

`--no-verify-jwt` matters only for `payme-webhook`: Payme authenticates with
its own signature header, it does not carry a Supabase JWT. `config.toml`
already declares this, but passing the flag here keeps the deploy explicit.

## 2. Push the Payme secrets to the edge environment (1 minute)

```bash
set -a; source .env; set +a
pnpm exec supabase secrets set --project-ref "$SUPABASE_PROJECT_REF" \
  PAYME_APP_ID="$PAYME_APP_ID" \
  PAYME_APP_SECRET="$PAYME_APP_SECRET" \
  PAYME_SANDBOX="$PAYME_SANDBOX"
```

Re-run this section any time you rotate the app secret.

## 3. Prove the functions are alive (1 minute)

```bash
curl -s "https://$SUPABASE_PROJECT_REF.supabase.co/functions/v1/payme-webhook" \
  -X POST -H "Content-Type: application/json" -d '{}' | head -c 200
```

Expected: `{"error":"invalid signature"}` — a 401 with valid JSON means the
function deployed and signature verification is active. That is correct; the
webhook must reject unsigned bodies.

---

## 4. Test a collection end to end in sandbox (10 minutes)

The flow mirrors what the app does, but with curl so you can see every hop.

### 4a. Create a pending top-up request as a real user

Sign up a test user, then file a request. Easiest way: use the app itself
(Add money → amount → Submit), which also gives you a nicer picture. With
curl instead:

```bash
# 1) sign up / sign in and keep the JWT
ANON=$(grep '^EXPO_PUBLIC_SUPABASE_ANON_KEY=' .env | cut -d= -f2-)
curl -s "https://$SUPABASE_PROJECT_REF.supabase.co/auth/v1/signup" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"email":"sandbox-test@nama.local","password":"test-password-123"}' | head -c 300

# 2) ask HQ to seed a merchant number if none exists (or file via hq console)

# 3) file the payment request [or just note the id shown in the app after
#    tapping Submit on Add money]
```

If email confirmation is required, confirm it in the Supabase dashboard
(Authentication → Users). For the sandbox test a dev sign-up works as-is.

### 4b. Trigger the USSD push

```bash
curl -s "https://$SUPABASE_PROJECT_REF.supabase.co/functions/v1/payme-collection" \
  -H "Authorization: Bearer <USER_JWT_FROM_STEP_4a>" \
  -H "Content-Type: application/json" \
  -d '{"payment_request_id":"<REQUEST_ID>","msisdn":"2557XXXXXXXX"}'
```

Expected response:

```json
{ "status": "success", "payment_status": "PENDING", "transaction_id": "901",
  "reference": "topup:<request_id>",
  "note": "Expect the USSD prompt on your phone..." }
```

Because `PAYME_SANDBOX=1` was pushed in step 2, every call carries
`X-Sandbox: 1` — transactions are simulated and the sandbox balance is
separate from live money. In sandbox the "USSD confirmation" usually resolves
directly to COMPLETED (or you complete it using Payme's developer-portal
webhook tester, Step 4c). No real PIN entry is needed and no real money moves.

### 4c. Deliver the webhook (the part that actually credits the wallet)

Payme does not need webhook pre-registration; the callback URL is inside each
request. To simulate the provider callback from the developer portal:

1. Open the Payme developer portal → **Webhook Testing**
2. Paste the function URL:
   `https://<project_ref>.supabase.co/functions/v1/payme-webhook`
3. Fire a payload shaped like the real one, matching your request:

```json
{
  "transid": "7945454515",
  "reference": "topup:<REQUEST_ID>",
  "result": "SUCCESS",
  "payment_status": "COMPLETED",
  "amount": "10000",
  "msisdn": "2557XXXXXXXX"
}
```

The portal signs it with the shared secret, so the function's
`X-Middleware-Signature` check passes and the wallet is credited **once**
through the idempotent approver. A page that says "invalid signature" means
the portal secret and your `PAYME_APP_SECRET` differ — re-run section 2.

You can also fire the webhook by hand if you replicate the signing yourself:

```bash
RAW='{"reference":"topup:<REQUEST_ID>","payment_status":"COMPLETED","amount":"10000"}'
TS=$(date +%s)
SIG=$(node -e "const c=require('crypto');console.log(c.createHmac('sha256',process.env.PS).update(process.argv[1]+process.argv[2]).digest('base64'))" "$RAW" "$TS" 2>/dev/null || true)
# or with openssl:
SIG=$(printf '%s%%s%s' "$RAW" "$TS" >/dev/null; echo "use node path above")
curl -s "https://$SUPABASE_PROJECT_REF.supabase.co/functions/v1/payme-webhook" \
  -X POST -H "Content-Type: application/json" \
  -H "X-Timestamp: $TS" -H "X-Middleware-Signature: $(node -e '...')" \
  -d "$RAW"
```

The portal tester is the intended tool; hand-signing is only a fallback.

### 4d. Verify the credit

- In the app: wallet balance changes; the payment request row flips to
  `approved` with note `payme auto-verified`.
- In the DB (authoritative):

```bash
psql "$DATABASE_URL" -c "select status, review_note, posted_txn_id from payment_requests where id='<REQUEST_ID>';"
psql "$DATABASE_URL" -c "select balance_tzs from accounts where kind='client_wallet' and user_id='<USER_ID>';"
```

`posted_txn_id` must be filled and the wallet equals the request amount. Run
the webhook twice on the same reference — the balance must NOT double (the
approval is idempotent; this is the double-credit test).

### 4e. Replay / tamper tests (do these once)

- Re-send the same webhook: balance unchanged ("credited" still answers OK).
- Change `"amount": "10000"` to `"1"` in the webhook: the posted amount is
  still the amount from OUR payment_requests row - we never trust the amount
  arriving in the callback.
- Send a webhook for a `topup:<random-uuid>`: ignored safely.

### 4f. Flip to production

When the sandbox flow is proven:

```bash
pnpm exec supabase secrets set --project-ref "$SUPABASE_PROJECT_REF" PAYME_SANDBOX=0
```

That is the only switch: the app may now charge real phones. Keep the live
`sbat` balance monitored from the Payme portal (Account Summary endpoint
`/api/v1/summarize` is wired into `_shared/payme.ts` if we build an HQ
reconciliation card later).

---

## TROUBLESHOOTING

| Symptom | Cause | Fix |
|---|---|---|
| `Access token not provided` during deploy | `.env` has empty `SUPABASE_ACCESS_TOKEN` | generate a token in the Supabase dashboard, redo sect. 0 |
| Deploy fails at "bundling" | syntax error in the function | run `deno check supabase/functions/payme-collection/index.ts` locally |
| collection returns `payme unreachable` | portal down / network block | retry; the request stays pending, nothing moved |
| collection returns 429 with `retry_after` | >10 transact / 10 s, or 3x violations → 15-min cooldown | serialize calls; wait out the suspension |
| `INS_FUNDS` on a disbursement test | sandbox app balance empty | top the sandbox app balance from the portal |
| webhook always `invalid signature` | portal secret != our secret | re-run section 2, re-test |
| webhook 404 | deployed under a different project ref | check `$SUPABASE_PROJECT_REF` |
| request stays `pending` for ever with live provider | callback never arrived | use `/api/v1/query` with the reference (live checks 1/30 s, last-hour tx only); cron/manual review stays the safety net |
| email signup blocked | confirmation required | confirm via dashboard or disable confirmation for the pilot (decision Q5) |

---

## Where the automation touches the manual flow

- `_apply_topup_approval` was already idempotent in Phase 1; the webhook
  simply became a trusted caller of it. Old manual review path still works:
  an HQ approver sees the same request and can still approve/reject anything
  the automation missed. Nothing about the HQ payments queue changes for
  bookings (only top-ups are automated, as agreed).
