import { StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { Button, Screen, Title } from '@/components/ui';
import { formatTzs } from '@nama/shared';
import { useWalletBalance } from '@/lib/wallet';
import { useMyPaymentRequests } from '@/lib/topup';
import { colors } from '@/constants/theme';
import { useTranslation } from 'react-i18next';
import { Link } from 'expo-router';

export default function ClientHome() {
  const { t } = useTranslation();
  const { data: balance } = useWalletBalance();
  const { data: requests } = useMyPaymentRequests();
  const _queryClient = useQueryClient();

  return (
    <Screen>
      <Title>
        {t('home.clientGreeting')}
      </Title>
      <View style={styles.wallet}>
        <Text style={styles.balanceLabel}>{t('wallet.balance')}</Text>
        <Text style={styles.balance}>{formatTzs(BigInt(balance ?? 0))}</Text>
        <Link href="/client/add-money" asChild>
          <Button variant="secondary" title={t('wallet.addMoney')} />
        </Link>
      </View>
      <Link href="/(client)/find" asChild>
        <Button title={t('book.find')} />
      </Link>
      <Link href="/(client)/bookings" asChild>
        <Button variant="secondary" title={t('book.myVisits')} />
      </Link>
      <View style={styles.requests}>
        <Text style={styles.sectionTitle}>{t('wallet.topupRequests')}</Text>
        {requests && requests.length === 0 && (
          <Text style={styles.placeholder}>{t('wallet.noRequests')}</Text>
        )}
        {requests?.map((req) => (
          <View key={req.id} style={styles.reqRow}>
            <Text style={styles.reqLine}>
              {formatTzs(BigInt(req.amount_tzs))} • {req.network} • {req.status}
            </Text>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wallet: { padding: 16, backgroundColor: '#fff', borderRadius: 12, marginTop: 16 },
  balanceLabel: { color: colors.charcoal, opacity: 0.7 },
  balance: { fontSize: 28, fontWeight: '700', marginBottom: 12 },
  requests: { marginTop: 16, flex: 1 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  placeholder: { opacity: 0.7 },
  reqRow: { backgroundColor: '#fff', padding: 12, borderRadius: 8, marginBottom: 8 },
  reqLine: { color: colors.charcoal },
});
