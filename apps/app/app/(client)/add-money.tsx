import { StyleSheet, Text, TextInput, View, Pressable } from 'react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Button, ErrorText, Screen, Subtitle, Title, Card } from '@/components/ui';
import { requestTopup, useMerchantNumbers } from '@/lib/wallet';
import { usePaymeCollect } from '@/lib/payme';
import { colors } from '@/constants/theme';
import { formatTzs } from '@nama/shared';

export default function AddMoney() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: merchants } = useMerchantNumbers();
  const [amount, setAmount] = useState('20000');
  const [phone, setPhone] = useState('255');
  const [createdId, setCreatedId] = useState<string | null>(null);
  const payme = usePaymeCollect();

  const topup = useMutation({ mutationFn: requestTopup });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['my-payment-requests'] });
    void queryClient.invalidateQueries({ queryKey: ['wallet-balance'] });
  };

  const fileRequest = async () => {
    const a = Number(amount);
    if (!a || a <= 0) return;
    const merchant = (merchants ?? [])[0];
    if (!merchant) return;
    try {
      const id = await topup.mutateAsync({
        amount_tzs: a,
        network: merchant.network as never,
        merchant_number_id: merchant.id,
      });
      setCreatedId(String(id));
    } catch {
      // error handled via mutation error state
    }
  };

  const payNow = async () => {
    if (!createdId) return;
    try {
      const res = await payme.mutateAsync({
        payment_request_id: createdId,
        msisdn: phone.replace(/\D/g, ''),
      });
      if (res.payment_status === 'COMPLETED' || res.status === 'success') {
        invalidate();
        router.back();
      }
    } catch {
      // error handled via mutation error state
    }
  };

  const errorText =
    topup.error instanceof Error
      ? topup.error.message
      : payme.error instanceof Error
        ? payme.error.message
        : (payme.data?.error ?? null);

  const merchant = (merchants ?? [])[0];

  return (
    <Screen scroll>
      <Title>{t('wallet.addMoney')}</Title>
      <Subtitle>{t('wallet.paymeNote')}</Subtitle>

      {!createdId ? (
        <Card style={styles.card}>
          <Text style={styles.sectionHeader}>1. Enter amount & select rail</Text>
          <View style={styles.chipRow}>
            {['10000', '20000', '50000', '100000'].map((val) => (
              <Pressable
                key={val}
                style={[styles.chip, amount === val && styles.chipActive]}
                onPress={() => setAmount(val)}
              >
                <Text style={[styles.chipText, amount === val && styles.chipTextActive]}>
                  {formatTzs(BigInt(val))}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.fieldWrap}>
            <Text style={styles.label}>{t('wallet.amountTZS')}</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
            />
          </View>
{merchant && (
  <View style={styles.merchantBox}>
    <Text style={styles.merchantLabel}>Selected Mobile Network:</Text>
    <Text style={styles.merchantValue}>{merchant.network} • {merchant.number} ({merchant.display_name})</Text>
  </View>
)}

<Button title="Continue to Payment" onPress={fileRequest} loading={topup.isPending} />
</Card>
) : (
<Card style={styles.card} variant="mint">
<Text style={styles.sectionHeader}>2. Confirm USSD Mobile Prompt</Text>
<Text style={styles.subText}>
  We have prepared your top-up request for {formatTzs(BigInt(amount))}. Enter your mobile money phone number to receive the prompt on your phone.
</Text>

<View style={styles.fieldWrap}>
  <Text style={styles.label}>Phone number (e.g. 2557XXXXXXXX)</Text>
  <TextInput
    style={styles.input}
    keyboardType="phone-pad"
    value={phone}
    onChangeText={setPhone}
    autoCapitalize="none"
  />
</View>

          <Button title={t('wallet.payWithPayme')} onPress={payNow} loading={payme.isPending} />
          <Button
            variant="outline"
            title="Cancel"
            onPress={() => setCreatedId(null)}
          />
        </Card>
      )}

      {errorText && <ErrorText message={errorText} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { padding: 24, borderRadius: 20, gap: 16 },
  sectionHeader: { fontSize: 18, fontWeight: '800', color: colors.charcoal },
  subText: { fontSize: 14, color: colors.charcoal, opacity: 0.8, lineHeight: 20 },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, backgroundColor: colors.softWhite, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.deepGreen, borderColor: colors.deepGreen },
  chipText: { fontSize: 14, fontWeight: '700', color: colors.charcoal },
  chipTextActive: { color: colors.onDark },
  fieldWrap: { gap: 6 },
  label: { fontSize: 14, fontWeight: '700', color: colors.charcoal },
  input: { borderWidth: 1, borderColor: colors.border, backgroundColor: '#FFFFFF', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: colors.charcoal },
  merchantBox: { backgroundColor: colors.softWhite, padding: 12, borderRadius: 12, gap: 4 },
  merchantLabel: { fontSize: 12, fontWeight: '600', color: colors.charcoal, opacity: 0.6 },
  merchantValue: { fontSize: 14, fontWeight: '700', color: colors.deepGreen },
});
