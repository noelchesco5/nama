import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, Screen, Subtitle, Title } from '@/components/ui';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { colors } from '@/constants/theme';

export default function SpecialistHome() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [status, setStatus] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void supabase
      .from('specialist_profiles')
      .select('status, console_unlocked')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (active) {
          setStatus(data?.status ?? null);
          setUnlocked(data?.console_unlocked ?? null);
        }
      });
    return () => {
      active = false;
    };
  }, [user]);

  const pending = status !== 'approved';
  const gatedOnboarding = status === 'approved' && unlocked === false;

  return (
    <Screen>
      <Title>{t('auth.specialist')}</Title>
      {pending ? (
        <View style={styles.body}>
          <Subtitle>{t('home.specialistPending')}</Subtitle>
          <Text style={styles.muted}>{t('home.specialistPendingBody')}</Text>
        </View>
      ) : (
        <View style={styles.body}>
          {gatedOnboarding ? (
            <>
              <Subtitle>{t('onb.gated')}</Subtitle>
              <Button title={t('onb.title')} onPress={() => router.push('/(specialist)/onboarding')} />
            </>
          ) : (
            <>
              <Button title={t('sp.requests')} onPress={() => router.push('/(specialist)/requests')} />
              <Button
                variant="secondary"
                title={t('sp.earnings')}
                onPress={() => router.push('/(specialist)/earnings')}
              />
              <Button
                variant="secondary"
                title={t('sched.title')}
                onPress={() => router.push('/(specialist)/schedule')}
              />
            </>
          )}
        </View>
      )}
      <Button title={t('common.signOut')} onPress={() => void signOut()} variant="secondary" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', gap: 8 },
  muted: { color: colors.charcoal, opacity: 0.7 },
});
