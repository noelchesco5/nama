import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, Screen, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { colors } from '@/constants/theme';

export default function ClientHome() {
  const { t } = useTranslation();
  const { displayName, signOut } = useAuth();

  return (
    <Screen>
      <Title>
        {t('home.clientGreeting')}
        {displayName ? `, ${displayName}` : ''}
      </Title>
      <View style={styles.body}>
        <Text style={styles.placeholder}>{t('common.appName')}</Text>
      </View>
      <Button title={t('common.signOut')} onPress={() => void signOut()} variant="secondary" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center' },
  placeholder: { fontSize: 16, color: colors.charcoal, opacity: 0.7 },
});
