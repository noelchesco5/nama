import { useState } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Button, ErrorText, Field, Screen, Subtitle, Title, Card } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { useRequestBooking } from '@/lib/bookings';
import { formatTzs } from '@nama/shared';

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function parseWhen(when: string, hour: string): Date | null {
  const d = new Date(`${when}T${hour}:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

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
      <View style={styles.headerRow}>
        <Title>{params.name ?? t('book.bookings')}</Title>
        <Text style={styles.priceTag}>{formatTzs(BigInt(price))}</Text>
      </View>
      <Subtitle>Book verified care at your home. Escrow protected.</Subtitle>

      <View style={styles.stepsIndicator}>
        <View style={[styles.stepDot, step >= 1 && styles.stepDotActive]} />
        <View style={[styles.stepDot, step >= 2 && styles.stepDotActive]} />
        <View style={[styles.stepDot, step >= 3 && styles.stepDotActive]} />
        <Text style={styles.stepLabel}>Step {step} of 3</Text>
      </View>

      {step === 1 && (
        <Card style={styles.card}>
          <Text style={styles.cardHeader}>1. Choose date and time</Text>
          <Field
            label="Date (YYYY-MM-DD)"
            value={when}
            onChangeText={setWhen}
            autoCapitalize="none"
          />
          <Field
            label="Time (HH:MM)"
            value={hour}
            onChangeText={setHour}
            autoCapitalize="none"
          />
          <View style={styles.timeChips}>
            {['09:00', '11:00', '14:00', '16:00'].map((h) => (
              <Pressable key={h} style={styles.chip} onPress={() => setHour(h)}>
                <Text style={styles.chipText}>{h}</Text>
              </Pressable>
            ))}
          </View>
          <Button title={t('common.continue')} onPress={next} />
        </Card>
      )}

      {step === 2 && (
        <Card style={styles.card}>
          <Text style={styles.cardHeader}>2. Where & Who is this for?</Text>
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
          <Button variant="secondary" title="Back" onPress={() => setStep(1)} />
        </Card>
      )}

      {step === 3 && (
        <Card style={styles.card} variant="mint">
          <Text style={styles.cardHeader}>3. Review & Hold Escrow</Text>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLine}>📅 When: {when} at {hour}</Text>
            <Text style={styles.summaryLine}>📍 Where: {address || 'Home (default)'}</Text>
            <Text style={styles.summaryLine}>👤 For: {forName || 'Self'}</Text>
            <Text style={styles.summaryLine}>💰 Total: {formatTzs(BigInt(price))}</Text>
          </View>
          <Text style={styles.cancelPolicy}>
            Cancellation policy: Free cancel &gt;6h ahead. Under 6h, subject to review. Funds are held in escrow and released only upon completion.
          </Text>
          <Button title={t('book.confirmRequest')} onPress={submit} loading={confirming} />
          <Button variant="secondary" title="Back" onPress={() => setStep(2)} />
        </Card>
      )}

      <ErrorText message={error ?? undefined} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  priceTag: { fontSize: 18, fontWeight: '800', color: colors.deepGreen },
  stepsIndicator: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 4 },
  stepDot: { width: 24, height: 6, borderRadius: 3, backgroundColor: colors.border },
  stepDotActive: { backgroundColor: colors.deepGreen, width: 36 },
  stepLabel: { fontSize: 13, fontWeight: '700', color: colors.charcoal, opacity: 0.6, marginLeft: 8 },
  card: { padding: 24, borderRadius: 20, gap: 16 },
  cardHeader: { fontSize: 18, fontWeight: '800', color: colors.charcoal },
  timeChips: { flexDirection: 'row', gap: 8, marginVertical: 4 },
  chip: { backgroundColor: colors.softWhite, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: colors.border },
  chipText: { fontSize: 14, fontWeight: '700', color: colors.deepGreen },
  summaryBox: { backgroundColor: '#FFFFFF', padding: 16, borderRadius: 14, gap: 8, borderWidth: 1, borderColor: colors.border },
  summaryLine: { fontSize: 15, fontWeight: '600', color: colors.charcoal },
  cancelPolicy: { fontSize: 12, color: colors.charcoal, opacity: 0.7, lineHeight: 18 },
});
