import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Button, ErrorText, Field, Screen, Subtitle, Title } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { useRequestBooking } from '@/lib/bookings';
import { formatTzs } from '@nama/shared';

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function parseWhen(when: string, hour: string): Date | null {
  const d = new Date(`${when}T${hour}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmt(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

// Three-step booking: when -> where/who -> confirm. The form holds exactly
// the fields request_booking() accepts; the DB validates the rest.
export default function BookFlow() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ specialist_id: string; service_id: string; price: string; name: string }>();
  const [step, setStep] = useState(1);
  const [when, setWhen] = useState(tomorrow());
  const [hour, setHour] = useState('09:00');
  const [address, setAddress] = useState('');
  const [forName, setForName] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestBooking = useRequestBooking();

  const price = params.price ?? '0';
  const parsed = parseWhen(when, hour);

  const next = () => {
    setError(null);
    if (step === 1 && !parsed) {
      setError(t('book.invalidTime'));
      return;
    }
    setStep((s) => Math.min(3, s + 1));
  };

  const submit = async () => {
    if (!parsed) return;
    setConfirming(true);
    setError(null);
    try {
      const id = await requestBooking.mutateAsync({
        specialist_id: params.specialist_id as string,
        service_id: params.service_id as string,
        price_tzs: Number(price),
        starts_at: parsed.toISOString(),
        address_text: address || null,
        for_name: forName || null,
      });
      router.replace(`/(client)/booking/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConfirming(false);
    }
  };

  if (!params.specialist_id || !params.service_id) {
    return (
      <Screen>
        <ErrorText message={t('common.error')} />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Title>{params.name ?? t('book.bookings')}</Title>
      <Subtitle>
        {t('book.pricePerVisit')}: {formatTzs(BigInt(price))}
      </Subtitle>
      <Text style={styles.stepLabel}>{t('book.step')} {step}/3</Text>

      {step === 1 && (
        <>
          <Field
            label={t('book.date')}
            value={when}
            onChangeText={setWhen}
            autoCapitalize="none"
          />
          <Field
            label={t('book.time')}
            value={hour}
            onChangeText={setHour}
            autoCapitalize="none"
          />
          <Button title={t('common.continue')} onPress={next} />
        </>
      )}

      {step === 2 && (
        <>
          <Field
            label={t('book.address')}
            value={address}
            onChangeText={setAddress}
            placeholder={t('book.addressHint')}
            multiline
          />
          <Field
            label={t('book.forName')}
            value={forName}
            onChangeText={setForName}
            placeholder={t('book.forNameHint')}
          />
          <Button title={t('common.continue')} onPress={next} />
          <Button variant="secondary" title={t('common.cancel')} onPress={() => setStep(1)} />
        </>
      )}

      {step === 3 && (
        <>
          <View style={styles.summary}>
            <Text style={styles.summaryLine}>
              {t('book.date')}: {parsed ? fmt(parsed) : '—'}
            </Text>
            <Text style={styles.summaryLine}>
              {t('book.address')}: {address || t('book.noAddress')}
            </Text>
            <Text style={styles.summaryLine}>
              {t('book.forName')}: {forName || t('book.forSelf')}
            </Text>
            <Text style={[styles.summaryLine, styles.summaryPrice]}>
              {t('book.holdNote', { amount: formatTzs(BigInt(price)) })}
            </Text>
          </View>
          <Button title={t('book.confirmRequest')} onPress={submit} loading={confirming} />
          <Button variant="secondary" title={t('common.cancel')} onPress={() => setStep(2)} />
        </>
      )}
      <ErrorText message={error ?? undefined} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stepLabel: { fontSize: 13, opacity: 0.6, color: colors.charcoal },
  summary: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: spacing.lg, gap: spacing.sm },
  summaryLine: { fontSize: 15, color: colors.charcoal },
  summaryPrice: { fontWeight: '700', marginTop: 4 },
});
