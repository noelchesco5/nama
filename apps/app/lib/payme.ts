import { supabase } from '@/lib/supabase';
import { useMutation } from '@tanstack/react-query';

// Client side of the automated Payme top-up payment:
//   1. Client files a pending request (existing request_topup flow).
//   2. Client calls this hook with the request id + their phone number.
//   3. Edge function pushes a USSD prompt (signed HMAC, server-held secret).
//   4. On confirmation the webhook side of the edge credits the wallet
//      automatically (`_apply_topup_approval`). No manual HQ review needed.

export type PaymeCollectResult = {
  status?: string;
  payment_status?: 'PENDING' | 'COMPLETED' | 'FAILED';
  reference?: string;
  note?: string;
  error?: string;
};

export function usePaymeCollect() {
  return useMutation({
    mutationFn: async (p: { payment_request_id: string; msisdn: string }): Promise<PaymeCollectResult> => {
      const { data, error } = await supabase.functions.invoke('payme-collection', {
        body: { payment_request_id: p.payment_request_id, msisdn: p.msisdn },
      });
      if (error) {
        // functions.invoke wraps HTTP errors; surface the message inside.
        const ctx = (error as { context?: PaymeCollectResult }).context ?? {};
        throw new Error(ctx.error ?? error.message);
      }
      return (data ?? {}) as PaymeCollectResult;
    },
  });
}
