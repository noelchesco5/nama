import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';

import { Button, Screen, Title } from '@/components/ui';
import { useAllPaymentRequests, approveTopup, rejectTopup, resolveAppeal } from '@/lib/hq';
import { formatTzs } from '@nama/shared';

export default function HqPayments() {
  const { t } = useTranslation();
  const { data: requests } = useAllPaymentRequests();
  const queryClient = useQueryClient();

  const onApprove = async (id: string) => {
    await approveTopup(id);
    void queryClient.invalidateQueries({ queryKey: ['hq-payment-requests'] });
    void queryClient.invalidateQueries({ queryKey: ['wallet-balance'] });
  };

  const onReject = async (id: string) => {
    await rejectTopup(id, 'ref_not_found');
    void queryClient.invalidateQueries({ queryKey: ['hq-payment-requests'] });
  };

  const onResolve = async (id: string, approve: boolean) => {
    await resolveAppeal(id, approve);
    void queryClient.invalidateQueries({ queryKey: ['hq-payment-requests'] });
    void queryClient.invalidateQueries({ queryKey: ['wallet-balance'] });
  };

  return (
    <Screen scroll>
      <Title>{t('wallet.topupRequests')}</Title>
      <View style={styles.requests}>
        {requests?.map((req) => (
          <View key={req.id} style={styles.reqRow}>
            <Text style={styles.reqLine}>
              {formatTzs(BigInt(req.amount_tzs))} • {req.network} • {req.status}
            </Text>
            {req.status === 'pending' && (
              <View style={styles.row}>
                <Button title={t('wallet.approved')} onPress={() => void onApprove(req.id)} />
                <Button title={t('wallet.rejected')} onPress={() => void onReject(req.id)} variant="secondary" />
              </View>
            )}
            {req.status === 'appealed' && (
              <View style={styles.row}>
                <Button title={t('wallet.ok')} onPress={() => void onResolve(req.id, true)} />
                <Button title={t('wallet.rejected')} onPress={() => void onResolve(req.id, false)} variant="secondary" />
              </View>
            )}
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  requests: { marginTop: 16, gap: 8 },
  reqRow: { backgroundColor: '#fff', padding: 12, borderRadius: 8, gap: 8 },
  reqLine: { color: '#333' },
  row: { flexDirection: 'row', gap: 8 },
});
