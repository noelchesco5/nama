import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type Booking = {
  id: string;
  client_id: string;
  specialist_id: string;
  service_id: string;
  price_tzs: number;
  status: 'requested' | 'accepted' | 'declined' | 'in_progress' | 'completed' | 'cancelled' | 'disputed' | 'expired';
  lat: number | null;
  lng: number | null;
  address_text: string | null;
  starts_at: string | null;
  for_name: string | null;
  acceptance_expires_at: string | null;
  accepted_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  refund_case_id: string | null;
  created_at: string;
};

export type Service = {
  id: string;
  category: string;
  name_en: string;
  name_sw: string;
  description_en: string | null;
};

export type SpecialistListing = {
  specialist_id: string;
  display_name: string;
  bio: string | null;
  price_tzs: number;
  distance_km: number | null;
  rating_avg: number | null;
  rating_count: number | null;
};

export type ChatMessage = {
  id: string;
  booking_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

export function useServices() {
  return useQuery({
    queryKey: ['services'],
    queryFn: async (): Promise<Service[]> => {
      const { data, error } = await supabase
        .from('services')
        .select('id, category, name_en, name_sw, description_en')
        .eq('active', true)
        .order('name_en');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSpecialists(serviceId: string | null, loc?: { lat: number; lng: number } | null) {
  return useQuery({
    queryKey: ['specialists', serviceId, loc?.lat, loc?.lng],
    enabled: !!serviceId,
    queryFn: async (): Promise<SpecialistListing[]> => {
      const { data, error } = await supabase.rpc('find_specialists', {
        p_service_id: serviceId,
        p_lat: loc?.lat ?? null,
        p_lng: loc?.lng ?? null,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------

export function useMyBookings() {
  return useQuery({
    queryKey: ['bookings', 'mine'],
    queryFn: async (): Promise<Booking[]> => {
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .in('status', ['requested', 'accepted', 'in_progress', 'disputed'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Booking[];
    },
  });
}

export function useBookingHistory() {
  return useQuery({
    queryKey: ['bookings', 'history'],
    queryFn: async (): Promise<(Booking & { service_name: string | null })[]> => {
      const { data, error } = await supabase
        .from('bookings')
        .select('*, services ( name_en, name_sw )')
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []).map((row: Record<string, unknown>) => ({
        ...(row as unknown as Booking),
        service_name: (row.services as { name_en: string } | null)?.name_en ?? null,
      }));
    },
  });
}

export function useBooking(id: string) {
  return useQuery({
    queryKey: ['booking', id],
    queryFn: async (): Promise<Booking> => {
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as Booking;
    },
  });
}

async function rpc<T = void>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export function useRequestBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: {
      specialist_id: string;
      service_id: string;
      price_tzs: number;
      starts_at: string;
      lat?: number | null;
      lng?: number | null;
      address_text?: string | null;
      for_name?: string | null;
    }) => rpc<string>('request_booking', p as unknown as Record<string, unknown>),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['bookings'] });
      void qc.invalidateQueries({ queryKey: ['wallet-balance'] });
    },
  });
}

export function useCancelBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { booking_id: string; reason?: string }) =>
      rpc('cancel_booking', { p_booking_id: p.booking_id, p_reason: p.reason ?? null }),
    onSuccess: (_d, v) => void qc.invalidateQueries({ queryKey: ['booking', v.booking_id] }),
  });
}

export function useDisputeBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { booking_id: string; reason?: string }) =>
      rpc('dispute_booking', { p_booking_id: p.booking_id, p_reason: p.reason ?? null }),
    onSuccess: (_d, v) => void qc.invalidateQueries({ queryKey: ['booking', v.booking_id] }),
  });
}

export function useCompleteBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { booking_id: string }) =>
      rpc('complete_booking', { p_booking_id: p.booking_id }),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['booking', v.booking_id] });
      void qc.invalidateQueries({ queryKey: ['wallet-balance'] });
    },
  });
}

export function useSubmitReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { booking_id: string; rating: number; comment?: string }) =>
      rpc('submit_review', {
        p_booking_id: p.booking_id,
        p_rating: p.rating,
        p_comment: p.comment ?? null,
      }),
    onSuccess: (_d, v) => void qc.invalidateQueries({ queryKey: ['booking', v.booking_id] }),
  });
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export function useMessages(bookingId: string) {
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

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { booking_id: string; body: string }) => {
      const { error } = await supabase.from('messages').insert({
        booking_id: p.booking_id,
        sender_id: (await supabase.auth.getUser()).data.user?.id,
        body: p.body,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => void qc.invalidateQueries({ queryKey: ['messages', v.booking_id] }),
  });
}
