import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, ErrorText, Field, Screen, Title } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { useAddSlot, useAvailability, useDeleteSlot } from '@/lib/specialist';

// Working hours: the specialist publishes availability slots; the dispatcher
// (find_specialists + later ORS ranking) only offers specialists with a slot
// around the requested time.
export default function SpecialistSchedule() {
  const { t } = useTranslation();
  const { data: slots } = useAvailability();
  const addSlot = useAddSlot();
  const delSlot = useDeleteSlot();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    setError(null);
    const starts = new Date(from);
    const ends = new Date(to);
    if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime()) || ends <= starts) {
      setError(t('sched.invalid'));
      return;
    }
    try {
      await addSlot.mutateAsync({ starts_at: starts.toISOString(), ends_at: ends.toISOString() });
      setFrom('');
      setTo('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await delSlot.mutateAsync(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Screen scroll>
      <Title>{t('sched.title')}</Title>
      <View style={styles.form}>
        <Field
          label={t('sched.from')}
          value={from}
          onChangeText={setFrom}
          placeholder="YYYY-MM-DDTHH:MM"
          autoCapitalize="none"
        />
        <Field
          label={t('sched.to')}
          value={to}
          onChangeText={setTo}
          placeholder="YYYY-MM-DDTHH:MM"
          autoCapitalize="none"
        />
        <Button title={t('sched.add')} onPress={add} loading={addSlot.isPending} />
        <ErrorText message={error ?? undefined} />
      </View>
      <Title>{t('sched.slots')}</Title>
      {slots && slots.length === 0 && <Text style={styles.muted}>{t('sched.empty')}</Text>}
      {(slots ?? []).map((s) => (
        <Pressable key={s.id} style={styles.slot} onPress={() => remove(s.id)}>
          <Text style={styles.slotText}>
            {s.starts_at.slice(0, 16).replace('T', ' ')} → {s.ends_at.slice(11, 16)}
          </Text>
          <Text style={styles.slotHint}>{t('sched.remove')}</Text>
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 8 },
  muted: { opacity: 0.7 },
  slot: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    padding: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  slotText: { fontSize: 14, color: colors.charcoal },
  slotHint: { fontSize: 12, opacity: 0.5 },
});
