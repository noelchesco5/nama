import { Link } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, ErrorText, Field, Screen, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { emailSchema, passwordSchema } from '@nama/shared';

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
      setError(t('auth.email'));
      return;
    }
    if (!passwordSchema.safeParse(password).success) {
      setError(t('auth.password'));
      return;
    }
    setBusy(true);
    try {
      await signIn(parsedEmail.data, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>{t('auth.signInTitle')}</Title>

      <Field
        label={t('auth.email')}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
      />
      <Field
        label={t('auth.password')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="password"
        autoComplete="current-password"
      />

      {error ? <ErrorText>{error}</ErrorText> : null}

      <Button title={t('auth.signIn')} onPress={onSubmit} loading={busy} />

      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Text>{t('auth.noAccount')}</Text>
        <Link href="/(auth)/sign-up" style={{ color: '#0B6B57', fontWeight: '700' }}>
          {t('auth.signUp')}
        </Link>
      </View>
    </Screen>
  );
}
