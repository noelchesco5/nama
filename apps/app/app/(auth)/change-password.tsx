import { useState } from 'react';
import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, ErrorText, Field, Screen, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { passwordSchema } from '@nama/shared';

export default function ChangePassword() {
  const { t } = useTranslation();
  const { changePassword } = useAuth();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    setError(null);
    if (!passwordSchema.safeParse(password).success) {
      setError(t('auth.password'));
      return;
    }
    if (password !== confirm) {
      setError(t('auth.password'));
      return;
    }
    setBusy(true);
    try {
      await changePassword(password);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>{t('auth.changePasswordTitle')}</Title>
      <Text>{t('auth.mustChange')}</Text>

      <Field
        label={t('auth.password')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="newPassword"
        autoComplete="new-password"
      />
      <Field
        label={t('auth.password')}
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        textContentType="newPassword"
      />

      {error ? <ErrorText>{error}</ErrorText> : null}

      <Button title={t('common.continue')} onPress={onSubmit} loading={busy} />
    </Screen>
  );
}
