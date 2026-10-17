import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, ErrorText, Screen, Subtitle, Title } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { useMerchantNumbers } from '@/lib/wallet';
import { supabase } from '@/lib/supabase';
import { formatTzs } from '@nama/shared';

// Gate 2 of the specialist console: HQ reviewed the documents (gate 1), now
// the specialist pays the HQ-set onboarding fee to the HQ merchant number,
// confirms here, and HQ completes the unlock from their console.
export default function SpecialistOnboarding() {
  const { t } = useTranslation();
  const { data: merchants } = useMerchantNumbers();
  const [fee, setFee] = useState<number | null>(null);
  const [paidId, setPaidId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fileFee = async () => {
    const merchant = (merchants ?? [])[0];
    if (!merchant) {
      setError(t('wallet.noMerchants'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { data, error: e } = await supabase.rpc('request_onboarding_fee', {
        p_merchant_number_id: merchant.id,
      });
      if (e) throw e;
      setPaidId(String(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  // The fee amount comes from HQ settings; read it client-side for display.
  const fetchFee = async () => {
    if (fee !== null) return;
    try {
      const { data, error: e } = await supabase
        .from('platform_settings')
        .select('value')
        .eq('key', 'onboarding_fee_tzs')
        .single();
      if (!e) setFee(Number((data?.value as { value?: number })?.value ?? 20000));
    } catch {
      setFee(20000);
    }
  };
  void fetchFee();

  return (
    <Screen scroll>
      <Title>{t('onb.title')}</Title>
      <Subtitle>{t('onb.subtitle')}</Subtitle>
      <View style={styles.card}>
        <Text style={styles.line}>{t('onb.how1')}</Text>
        <Text style={styles.line}>{t('onb.how2')}</Text>
        <Text style={styles.line}>{t('onb.how3')}</Text>
        {fee !== null && (
          <Text style={styles.fee}>
            {t('onb.amount')}: {formatTzs(BigInt(fee))}
          </Text>
        )}
        {paidId ? (
          <Text style={styles.waiting}>{t('onb.waiting')}</Text>
        ) : (
          <Button title={t('onb.iPaid')} onPress={fileFee} loading={busy} />
        )}
        <ErrorText message={error ?? undefined} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: radius.md, padding: spacing.lg, gap: spacing.md },
  line: { fontSize: 14, color: colors.charcoal },
  fee: { fontSize: 18, fontWeight: '800', color: colors.deepGreen },
  waiting: { fontSize: 14, color: colors.charcoal, opacity: 0.8 },
});
