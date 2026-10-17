import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { PaymentRequest } from './topup';

export async function fetchAllPaymentRequests(): Promise<PaymentRequest[]> {
  const { data, error } = await supabase
    .from('payment_requests')
    .select('id,amount_tzs,network,reference,status,reason_code,appeal_note,screenshot_path,appeal_screenshot_path,expires_at,created_at,reviewed_at,review_note')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function approveTopup(request_id: string, note?: string) {
  const { error } = await supabase.rpc('approve_topup', { p_request_id: request_id, p_note: note ?? null });
  if (error) throw error;
}

export async function rejectTopup(request_id: string, reason_code: string, note?: string) {
  const { error } = await supabase.rpc('reject_topup', { p_request_id: request_id, p_reason_code: reason_code, p_note: note ?? null });
  if (error) throw error;
}

export async function resolveAppeal(request_id: string, approve: boolean, note?: string) {
  const { error } = await supabase.rpc('resolve_appeal', { p_request_id: request_id, p_approve: approve, p_note: note ?? null });
  if (error) throw error;
}

export function useAllPaymentRequests() {
  return useQuery({ queryKey: ['hq-payment-requests'], queryFn: fetchAllPaymentRequests });
}
