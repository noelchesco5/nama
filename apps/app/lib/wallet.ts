import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

type MerchantNumber = {
  id: string;
  network: 'mpesa' | 'tigopesa' | 'airtel' | 'halopesa' | 'mixx';
  number: string;
  display_name: string;
  is_active: boolean;
};

export async function fetchWalletBalance(): Promise<number> {
  const { data, error } = await supabase.rpc('get_wallet_balance');
  if (error) throw error;
  return Number(data ?? 0);
}

export async function fetchMerchantNumbers(): Promise<MerchantNumber[]> {
  const { data, error } = await supabase
    .from('merchant_numbers')
    .select('id, network, number, display_name, is_active')
    .eq('is_active', true)
    .order('network');
  if (error) throw error;
  return data ?? [];
}

export async function requestTopup(params: {
  amount_tzs: number;
  network: MerchantNumber['network'];
  merchant_number_id: string;
  reference?: string;
  screenshot_path?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc('request_topup', {
    p_amount_tzs: params.amount_tzs,
    p_network: params.network,
    p_merchant_number_id: params.merchant_number_id,
    p_reference: params.reference,
    p_screenshot_path: params.screenshot_path,
  });
  if (error) throw error;
  return String(data);
}

export function useWalletBalance() {
  return useQuery({ queryKey: ['wallet-balance'], queryFn: fetchWalletBalance });
}

export function useMerchantNumbers() {
  return useQuery({ queryKey: ['merchant-numbers'], queryFn: fetchMerchantNumbers });
}
