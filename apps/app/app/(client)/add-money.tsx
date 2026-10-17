import { StyleSheet, TextInput, View } from 'react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Button, ErrorText, Screen, Title } from '@/components/ui';
import { requestTopup, useMerchantNumbers } from '@/lib/wallet';

export default function AddMoney() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: merchants } = useMerchantNumbers();
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [merchantId, setMerchantId] = useState('');

  const { mutate, isPending, error } = useMutation({
    mutationFn: requestTopup,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['my-payment-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['wallet-balance'] });
      router.back();
    },
  });

  const onSubmit = () => {
    const a = Number(amount);
    if (!merchantId || !a || a <= 0) return;
    mutate({ amount_tzs: a, network: 'mpesa' as any, merchant_number_id: merchantId, reference });
  };

  return (
    <Screen scroll>
      <Title>{t('wallet.addMoney')}</Title>
      <View style={styles.form}>
        <TextInput style={styles.input} keyboardType="numeric" placeholder={t('wallet.amountTZS')} value={amount} onChangeText={setAmount} />
        <TextInput style={styles.input} placeholder={t('wallet.merchant')} value={merchantId} onChangeText={setMerchantId} />
        <TextInput style={styles.input} placeholder={t('wallet.reference')} value={reference} onChangeText={setReference} />
        <Button title={t('wallet.submit')} onPress={onSubmit} disabled={isPending} />
        {error && <ErrorText message={error instanceof Error ? error.message : String(error)} />}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 16, marginTop: 16 },
  input: { borderWidth: 1, borderColor: '#ccc', padding: 12, borderRadius: 8 },
});
