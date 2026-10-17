import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SupabaseClient } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import type { Booking, ChatMessage } from '@/lib/bookings';

type Row = Record<string, unknown>;

async function rpc(fn: string, args: Record<string, unknown>) {
  const { error } = await supabase.rpc(fn, args);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Incoming requests + my bookings
// ---------------------------------------------------------------------------

export function useIncomingRequests() {
  return useQuery({
    queryKey: ['specialist-requests'],
    queryFn: async (): Promise<(Booking & { service_name: string | null })[]> => {
      const { data, error } = await supabase
        .from('bookings')
        .select('*, services ( name_en, name_sw )')
        .in('status', ['requested'])
        .order('acceptance_expires_at');
      if (error) throw error;
      return (data ?? []).map((r: Row) => ({
        ...(r as unknown as Booking),
        service_name: (r.services as { name_en: string } | null)?.name_en ?? null,
      }));
    },
  });
}

export function useMyJobs(statuses: string[]) {
  return useQuery({
    queryKey: ['specialist-jobs', statuses.join(',')],
    queryFn: async (): Promise<(Booking & { service_name: string | null })[]> => {
      const { data, error } = await supabase
        .from('bookings')
        .select('*, services ( name_en, name_sw )')
        .in('status', statuses)
        .order('starts_at');
      if (error) throw error;
      return (data ?? []).map((r: Row) => ({
        ...(r as unknown as Booking),
        service_name: (r.services as { name_en: string } | null)?.name_en ?? null,
      }));
    },
  });
}

export function useSpecialistBookingDetail() {
  const qc = useQueryClient();
  return {
    accept: useMutation({
      mutationFn: (id: string) => rpc('accept_booking', { p_booking_id: id }),
      onSuccess: () => void qc.invalidateQueries({ queryKey: ['specialist-requests'] }),
    }),
    decline: useMutation({
      mutationFn: (id: string) => rpc('decline_booking', { p_booking_id: id }),
      onSuccess: () => void qc.invalidateQueries({ queryKey: ['specialist-requests'] }),
    }),
    start: useMutation({
      mutationFn: (id: string) => rpc('start_booking', { p_booking_id: id }),
    }),
    complete: useMutation({
      mutationFn: (id: string) => rpc('complete_booking', { p_booking_id: id }),
    }),
    noShow: useMutation({
      mutationFn: (id: string) => rpc('mark_no_show', { p_booking_id: id }),
    }),
    acceptRepeat: useMutation({
      mutationFn: (id: string) => rpc('accept_repeat', { p_repeat_id: id }),
    }),
    declineRepeat: useMutation({
      mutationFn: (id: string) => rpc('decline_repeat', { p_repeat_id: id }),
    }),
  };
}

export function useRepeatRequests() {
  return useQuery({
    queryKey: ['repeat-requests'],
    queryFn: async (): Promise<(Row & { id: string; status: string })[]> => {
      const { data, error } = await supabase
        .from('repeat_requests')
        .select('*')
        .eq('status', 'pending');
      if (error) throw error;
      return (data ?? []) as (Row & { id: string; status: string })[];
    },
  });
}

// Specialist chat view (same table, specialist side).
export function useSpecialistMessages(bookingId: string) {
  return useQuery({
    queryKey: ['messages', bookingId],
    queryFn: async (): Promise<ChatMessage[]> => {
      const { data, error } = await supabase
        .from('messages')
        .select('id, booking_id, sender_id, body, created_at')
        .eq('booking_id', bookingId)
        .order('created_at');
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

export type Slot = { id: string; starts_at: string; ends_at: string };

export function useAvailability() {
  return useQuery({
    queryKey: ['availability'],
    queryFn: async (): Promise<Slot[]> => {
      const { data, error } = await supabase
        .from('availability_slots')
        .select('id, starts_at, ends_at')
        .order('starts_at');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAddSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { starts_at: string; ends_at: string }) => {
      const { error } = await supabase
        .from('availability_slots')
        .insert({ starts_at: p.starts_at, ends_at: p.ends_at });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['availability'] }),
  });
}

export function useDeleteSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('availability_slots').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['availability'] }),
  });
}

// ---------------------------------------------------------------------------
// Offered services
// ---------------------------------------------------------------------------

export type ListedService = {
  service_id: string;
  name_en: string;
  price_tzs: number | null;
};

export function useMyServices() {
  return useQuery({
    queryKey: ['my-services'],
    queryFn: async (): Promise<ListedService[]> => {
      const { data, error } = await supabase
        .from('specialist_services')
        .select('service_id, price_tzs, services ( name_en )');
      if (error) throw error;
      return (data ?? []).map((r: Row) => ({
        service_id: r.service_id as string,
        name_en: ((r.services as { name_en: string } | null)?.name_en) ?? '',
        price_tzs: r.price_tzs as number,
      }));
    },
  });
}

export function useUpsertService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { service_id: string; price_tzs: number }) => {
      const { error } = await supabase
        .from('specialist_services')
        .upsert({ service_id: p.service_id, price_tzs: p.price_tzs });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['my-services'] }),
  });
}

// ---------------------------------------------------------------------------
// Earnings + withdrawals
// ---------------------------------------------------------------------------

export function useEarningsBalance() {
  return useQuery({
    queryKey: ['earnings-balance'],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc('get_earnings_balance');
      if (error) throw error;
      return Number(data ?? 0);
    },
  });
}

export function useRequestWithdrawal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (amount: number) => {
      const { error } = await supabase.rpc('request_withdrawal', { p_amount_tzs: amount });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['my-withdrawals'] }),
  });
}

export function useMyWithdrawals() {
  return useQuery({
    queryKey: ['my-withdrawals'],
    queryFn: async (): Promise<(Row & { id: string; status: string })[]> => {
      const { data, error } = await supabase
        .from('withdrawals')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as (Row & { id: string; status: string })[];
    },
  });
}

// Keep the server client type import used somewhere honest for lint.
export type _Client = SupabaseClient;
