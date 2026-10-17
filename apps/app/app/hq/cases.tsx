import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { Button, ErrorText, Field, Screen, Subtitle, Title } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { formatTzs } from '@nama/shared';

type Case = {
  id: string;
  booking_id: string | null;
  requested_amount_tzs: number;
  status: string;
  reason: string | null;
};

async function rpc(fn: string, args: Record<string, unknown>) {
  const { error } = await supabase.rpc(fn, args);
  if (error) throw error;
}

export function useOpenCases() {
  return useQuery({
    queryKey: ['hq-cases'],
    queryFn: async (): Promise<Case[]> => {
      const { data, error } = await supabase
        .from('refund_cases')
        .select('id, booking_id, requested_amount_tzs, status, reason')
        .eq('status', 'open')
        .order('created_at');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export default function HqCases() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: cases } = useOpenCases();
  const [decided, setDecided] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const resolve = useMutation({
    mutationFn: async (c: Case) =>
      rpc('resolve_refund_case', {
        p_case_id: c.id,
        p_decided_amount_tzs: Number(decided[c.id] ?? c.requested_amount_tzs),
        p_note: note || null,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['hq-cases'] }),
  });

  const submit = async (c: Case) => {
    setError(null);
    try {
      await resolve.mutateAsync(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Screen scroll>
      <Title>{t('hq.cases')}</Title>
      <Subtitle>{t('hq.casesNote')}</Subtitle>
      {cases && cases.length === 0 && <Text style={styles.none}>{t('hq.noCases')}</Text>}
      {(cases ?? []).map((c) => (
        <View key={c.id} style={styles.card}>
          <Text style={styles.h}>
            {t('hq.caseAmount')}: {formatTzs(BigInt(c.requested_amount_tzs))}
          </Text>
          {c.reason ? <Text style={styles.line}>{c.reason}</Text> : null}
          <Field
            label={t('hq.decidedAmount')}
            value={String(decided[c.id] ?? c.requested_amount_tzs)}
            onChangeText={(v) => setDecided((d) => ({ ...d, [c.id]: v }))}
            keyboardType="numeric"
          />
          <Field label={t('hq.decisionNote')} value={note} onChangeText={setNote} multiline />
          <Button title={t('hq.resolve')} loading={resolve.isPending} onPress={() => submit(c)} />
        </View>
      ))}
      <ErrorText message={error ?? undefined} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  none: { opacity: 0.7 },
  card: { backgroundColor: '#FFFFFF', borderRadius: radius.md, padding: spacing.lg, gap: spacing.md },
  h: { fontSize: 15, fontWeight: '700', color: colors.charcoal },
  line: { fontSize: 13, color: colors.charcoal, opacity: 0.8 },
});
