import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type PaymentRequest = {
  id: string;
  amount_tzs: number;
  network: string;
  reference: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'appealed' | 'appeal_approved' | 'appeal_rejected' | 'cancelled';
  reason_code: string | null;
  appeal_note: string | null;
  screenshot_path: string | null;
  appeal_screenshot_path: string | null;
  expires_at: string | null;
  created_at: string;
  reviewed_at: string | null;
  review_note: string | null;
};

export async function fetchMyPaymentRequests(): Promise<PaymentRequest[]> {
  const { data, error } = await supabase
    .from('payment_requests')
    .select('id,amount_tzs,network,reference,status,reason_code,appeal_note,screenshot_path,appeal_screenshot_path,expires_at,created_at,reviewed_at,review_note')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export function useMyPaymentRequests() {
  return useQuery({ queryKey: ['my-payment-requests'], queryFn: fetchMyPaymentRequests });
}
