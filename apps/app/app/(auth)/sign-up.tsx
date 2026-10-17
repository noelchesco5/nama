import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, ErrorText, Field, Screen, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { colors, radius } from '@/constants/theme';
import { signUpSchema } from '@nama/shared';

export default function SignUp() {
  const { t, i18n } = useTranslation();
  const { signUp } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [intendedRole, setIntendedRole] = useState<'client' | 'specialist'>('client');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async () => {
    setError(null);
    const parsed = signUpSchema.safeParse({
      email: email.trim().toLowerCase(),
      password,
      fullName,
      phone: phone.trim() ? phone.trim() : undefined,
      intendedRole,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t('common.error'));
      return;
    }
    setBusy(true);
    try {
      await signUp({
        email: parsed.data.email,
        password: parsed.data.password,
        fullName: parsed.data.fullName,
        phone: parsed.data.phone,
        intendedRole,
        locale: i18n.language === 'sw' ? 'sw' : 'en',
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Screen>
        <Title>{t('auth.signInTitle')}</Title>
        <Text>{t('common.continue')}</Text>
        <Link href="/(auth)/sign-in" style={styles.link}>
          {t('auth.signIn')}
        </Link>
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>{t('auth.signUpTitle')}</Title>

      <Field label={t('auth.fullName')} value={fullName} onChangeText={setFullName} />
      <Field
        label={t('auth.email')}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
      />
      <Field
        label={t('auth.phone')}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        placeholder="+255..."
      />
      <Field
        label={t('auth.password')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="newPassword"
        autoComplete="new-password"
      />

      <View style={styles.roleRow}>
        <Text style={styles.roleLabel}>{t('auth.iAmA')}</Text>
        {(['client', 'specialist'] as const).map((r) => (
          <Pressable
            key={r}
            onPress={() => setIntendedRole(r)}
            style={[styles.chip, intendedRole === r && styles.chipActive]}
          >
            <Text style={[styles.chipText, intendedRole === r && styles.chipTextActive]}>
              {t(`auth.${r}`)}
            </Text>
          </Pressable>
        ))}
      </View>

      {error ? <ErrorText>{error}</ErrorText> : null}

      <Button title={t('auth.signUp')} onPress={onSubmit} loading={busy} />

      <View style={styles.row}>
        <Text>{t('auth.haveAccount')}</Text>
        <Link href="/(auth)/sign-in" style={styles.link}>
          {t('auth.signIn')}
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  roleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  roleLabel: { fontSize: 14, fontWeight: '600', color: colors.charcoal },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
  },
  chipActive: { backgroundColor: colors.mint, borderColor: colors.teal },
  chipText: { color: colors.charcoal },
  chipTextActive: { color: colors.deepGreen, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 6 },
  link: { color: colors.deepGreen, fontWeight: '700' },
});
