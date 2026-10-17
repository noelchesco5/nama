import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Link } from 'expo-router';

import { Button, Screen, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';

export default function HqHome() {
  const { t } = useTranslation();
  const { signOut } = useAuth();

  return (
    <Screen>
      <Title>{t('home.hqTitle')}</Title>
      <View style={styles.body}>
        <Link href="/hq/payments" asChild>
          <Button title={t('wallet.topupRequests')} />
        </Link>
        <Link href="/hq/cases" asChild>
          <Button variant="secondary" title={t('hq.cases')} />
        </Link>
      </View>
      <Button title={t('common.signOut')} onPress={() => void signOut()} variant="secondary" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
});
