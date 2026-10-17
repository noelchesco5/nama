import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, ErrorText, Field, Screen, Title } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { useEarningsBalance, useMyWithdrawals, useRequestWithdrawal } from '@/lib/specialist';
import { formatTzs } from '@nama/shared';

export default function SpecialistEarnings() {
  const { t } = useTranslation();
  const { data: balance } = useEarningsBalance();
  const { data: withdrawals } = useMyWithdrawals();
  const request = useRequestWithdrawal();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    const a = Number(amount);
    if (!a || a <= 0) return;
    try {
      await request.mutateAsync(a);
      setAmount('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Screen scroll>
      <Title>{t('sp.earnings')}</Title>
      <View style={styles.card}>
        <Text style={styles.h}>{t('sp.earnBalance')}</Text>
        <Text style={styles.money}>{formatTzs(BigInt(balance ?? 0))}</Text>
        <Field
          label={t('sp.withdrawAmount')}
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
        />
        <Button
          title={t('sp.requestWithdrawal')}
          loading={request.isPending}
          onPress={submit}
        />
        <ErrorText message={error ?? request.error?.message ?? undefined} />
      </View>
      <Title>{t('sp.withdrawals')}</Title>
      {withdrawals && withdrawals.length === 0 && (
        <Text style={styles.muted}>{t('sp.noWithdrawals')}</Text>
      )}
      {(withdrawals ?? []).map((w) => (
        <View key={w.id} style={styles.card}>
          <View style={styles.rowHead}>
            <Text style={styles.h}>{formatTzs(BigInt(Number(w.amount_tzs)))}</Text>
            <Text>{t(`sp.w_${w.status}`)}</Text>
          </View>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: radius.md, padding: spacing.lg, gap: spacing.md },
  h: { fontSize: 15, fontWeight: '700', color: colors.charcoal },
  money: { fontSize: 26, fontWeight: '800', color: colors.deepGreen },
  muted: { opacity: 0.7 },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between' },
});
