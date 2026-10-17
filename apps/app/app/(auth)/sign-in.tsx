import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, ErrorText, Field, Screen, Title, Card } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { emailSchema, passwordSchema } from '@nama/shared';
import { colors } from '@/constants/theme';

export default function SignIn() {
  const { t } = useTranslation();
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    setError(null);
    const parsedEmail = emailSchema.safeParse(email.trim().toLowerCase());
    if (!parsedEmail.success) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!passwordSchema.safeParse(password).success) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      await signIn(parsedEmail.data, password);
    } catch (e) {
      console.error('Sign-in failed:', e);
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('Email not confirmed')) {
        setError('Email not confirmed. Please check your Supabase dashboard and ensure Email Confirmations is disabled, or confirm your email.');
      } else if (msg.includes('Invalid login credentials') || msg.includes('invalid') || msg.includes('credentials') || msg.includes('422')) {
        setError('Incorrect email or password, or email not confirmed in Supabase.');
      } else {
        setError(msg || 'Unable to sign in. Please check your connection and try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Title>{t('auth.signInTitle')}</Title>
        <Text style={styles.subTitle}>Sign in to access your dashboard and manage care.</Text>
      </View>

      <Card style={styles.card}>
        <Field
          label={t('auth.email')}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          placeholder="name@example.com"
        />
        <Field
          label={t('auth.password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="password"
          autoComplete="current-password"
          placeholder="Enter your password"
        />

        {error ? <ErrorText message={error} /> : null}

        <Button title={t('auth.signIn')} onPress={onSubmit} loading={busy} />
      </Card>

      <View style={styles.row}>
        <Text style={styles.footerPrompt}>{t('auth.noAccount')} </Text>
        <Link href="/(auth)/sign-up" style={styles.link}>
          {t('auth.signUp')}
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 4, marginBottom: 8 },
  subTitle: { fontSize: 15, color: colors.charcoal, opacity: 0.7 },
  card: { padding: 24, borderRadius: 20, gap: 16 },
  row: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 16 },
  footerPrompt: { color: colors.charcoal, opacity: 0.8 },
  link: { color: colors.deepGreen, fontWeight: '800' },
});
