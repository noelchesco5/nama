// nama - shared Payme Africa client for edge functions.
// HMAC-signed requests, 5-minute replay window, app-side rate limiting help
// (serialize transact calls; see keys-and-details notes).

export const PAYME_BASE = 'https://portal.paymeafrica.com/api/v1';

export type PaymeResult = {
  ok: boolean;
  status?: string;
  paymentStatus?: string;
  transactionId?: string;
  message?: string;
  raw: Record<string, unknown>;
};

export async function paymeSignBody(
  secret: string,
  minifiedJson: string,
  timestamp: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(minifiedJson + timestamp));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

export async function paymeTransact(
  appId: string,
  secret: string,
  body: Record<string, unknown>,
  sandbox = false,
): Promise<PaymeResult> {
  const payload = JSON.stringify(body);
  const timestamp = `${Math.floor(Date.now() / 1000)}`;
  const signature = await paymeSignBody(secret, payload, timestamp);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-App-ID': appId,
    'X-Timestamp': timestamp,
    'X-Signature': signature,
  };
  if (sandbox) headers['X-Sandbox'] = '1';

  let res: Response;
  try {
    res = await fetch(`${PAYME_BASE}/transact`, { method: 'POST', headers, body: payload });
  } catch {
    return { ok: false, message: 'payme unreachable', raw: {} };
  }
  const text = await res.text();
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, message: `unexpected response (HTTP ${res.status})`, raw: {} };
  }
  return {
    ok: res.ok && raw.status === 'success',
    status: raw.status as string,
    paymentStatus: raw.payment_status as string,
    transactionId: raw.transaction_id as string,
    message: (raw.message as string) ?? undefined,
    raw,
  };
}

export async function paymeQuery(
  appId: string,
  secret: string,
  reference: string,
  sandbox = false,
): Promise<PaymeResult> {
  const payload = JSON.stringify({ reference });
  const timestamp = `${Math.floor(Date.now() / 1000)}`;
  const signature = await paymeSignBody(secret, payload, timestamp);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-App-ID': appId,
    'X-Timestamp': timestamp,
    'X-Signature': signature,
  };
  if (sandbox) headers['X-Sandbox'] = '1';
  const res = await fetch(`${PAYME_BASE}/query`, { method: 'POST', headers, body: payload });
  const text = await res.text();
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, message: 'unexpected response', raw: {} };
  }
  return {
    ok: res.ok,
    paymentStatus: raw.payment_status as string,
    transactionId: raw.transaction_id as string,
    raw,
  };
}
