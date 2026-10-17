import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { Button, ErrorText, Screen, Subtitle, Title } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { formatTzs } from '@nama/shared';

type OnboardingReq = {
  id: string;
  user_id: string;
  amount_tzs: number;
  reference: string;
  created_at: string;
};

function useOnboardingQueue() {
  const qc = useQueryClient();
  const { data, error } = useQuery({
    queryKey: ['hq-onboarding'],
    queryFn: async (): Promise<OnboardingReq[]> => {
      const { data, error } = await supabase
        .from('payment_requests')
        .select('id, user_id, amount_tzs, reference, created_at')
        .like('reference', 'onboarding:%')
        .eq('status', 'pending')
        .order('created_at');
      if (error) throw error;
      return data ?? [];
    },
  });
  const approve = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('approve_onboarding', { p_request_id: id });
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['hq-onboarding'] }),
  });
  return { data, error, approve };
}

// Gate 2 confirmations: the specialist paid the onboarding fee externally;
// HQ verifies the money arrived, then unlocks the console.
export default function HqOnboarding() {
  const { t } = useTranslation();
  const { data: queue, approve } = useOnboardingQueue();
  const [error, setError] = useState<string | null>(null);

  const confirm = async (id: string) => {
    setError(null);
    try {
      await approve.mutateAsync(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Screen scroll>
      <Title>{t('hq.onboarding')}</Title>
      <Subtitle>{t('hq.onboardingNote')}</Subtitle>
      {queue && queue.length === 0 && <Text style={styles.none}>{t('hq.noOnboarding')}</Text>}
      {(queue ?? []).map((q) => (
        <View key={q.id} style={styles.card}>
          <Text style={styles.h}>{formatTzs(BigInt(q.amount_tzs))}</Text>
          <Text style={styles.line}>{t('hq.onboardingSubmitted')} {q.created_at.slice(0, 10)}</Text>
          <Button title={t('hq.onboardingConfirm')} loading={approve.isPending} onPress={() => confirm(q.id)} />
        </View>
      ))}
      <ErrorText message={error ?? undefined} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  none: { opacity: 0.7 },
  card: { backgroundColor: '#FFFFFF', borderRadius: radius.md, padding: spacing.lg, gap: spacing.md },
  h: { fontSize: 16, fontWeight: '700', color: colors.charcoal },
  line: { fontSize: 13, color: colors.charcoal, opacity: 0.8 },
});
