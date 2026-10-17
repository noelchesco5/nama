import { StyleSheet, TextInput, View } from 'react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Button, ErrorText, Screen, Subtitle, Title } from '@/components/ui';
import { requestTopup, useMerchantNumbers } from '@/lib/wallet';
import { usePaymeCollect } from '@/lib/payme';

export default function AddMoney() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: merchants } = useMerchantNumbers();
  const [amount, setAmount] = useState('');
  const [phone, setPhone] = useState('');
  const [reference, setReference] = useState('');
  const [createdId, setCreatedId] = useState<string | null>(null);
  const payme = usePaymeCollect();

  const topup = useMutation({ mutationFn: requestTopup });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['my-payment-requests'] });
    void queryClient.invalidateQueries({ queryKey: ['wallet-balance'] });
  };

  // Step 1: file the pending request (merchant snapshot comes from HQ's list).
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
        reference: reference || undefined,
      });
      setCreatedId(String(id));
    } catch {
      // surfaced through topup.error below
    }
  };

  // Step 2: push the USSD prompt; the webhook credits the wallet on PIN entry.
  const payNow = async () => {
    if (!createdId) return;
    try {
      const res = await payme.mutateAsync({
        payment_request_id: createdId,
        msisdn: phone.replace(/\D/g, ''),
      });
      if (res.payment_status === 'COMPLETED') {
        invalidate();
        router.back();
      }
      // PENDING stays: the user confirms with PIN on the phone, then sees the
      // credit appear on the home screen via invalidated queries.
    } catch {
      // surfaced through payme.error below
    }
  };

  const errorText =
    topup.error instanceof Error
      ? topup.error.message
      : payme.error instanceof Error
        ? payme.error.message
        : (payme.data?.error ?? null);

  return (
    <Screen scroll>
      <Title>{t('wallet.addMoney')}</Title>
      <Subtitle>{t('wallet.paymeNote')}</Subtitle>
      <View style={styles.form}>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          placeholder={t('wallet.amountTZS')}
          value={amount}
          onChangeText={setAmount}
        />
        {createdId ? (
          <>
            <TextInput
              style={styles.input}
              keyboardType="phone-pad"
              placeholder={t('wallet.phone')}
              value={phone}
              onChangeText={setPhone}
              autoCapitalize="none"
            />
            <Button title={t('wallet.payWithPayme')} onPress={payNow} loading={payme.isPending} />
          </>
        ) : (
          <>
            <TextInput
              style={styles.input}
              placeholder={t('wallet.reference')}
              value={reference}
              onChangeText={setReference}
            />
            <Button title={t('wallet.submit')} onPress={fileRequest} loading={topup.isPending} />
          </>
        )}
        {errorText && <ErrorText message={errorText} />}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 16, marginTop: 16 },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 12, borderRadius: 8 },
});
