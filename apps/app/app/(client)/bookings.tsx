import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ErrorText, Screen, Title } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { useBookingHistory } from '@/lib/bookings';

export default function MyBookings() {
  const { t } = useTranslation();
  const router = useRouter();
  const { data: bookings, error } = useBookingHistory();

  return (
    <Screen scroll>
      <Title>{t('book.myVisits')}</Title>
      <ErrorText message={error?.message} />
      {bookings && bookings.length === 0 && (
        <Text style={styles.none}>{t('book.noVisits')}</Text>
      )}
      {(bookings ?? []).map((b) => (
        <Pressable
          key={b.id}
          style={styles.row}
          onPress={() => router.push(`/(client)/booking/${b.id}`)}
        >
          <View style={styles.rowHead}>
            <Text style={styles.rowTitle}>{b.service_name ?? t('book.bookings')}</Text>
            <Text style={[styles.chip, styles[`s_${b.status}`] ?? styles.s_other]}>
              {t(`status.${b.status}`)}
            </Text>
          </View>
          <Text style={styles.rowSub}>
            {b.for_name ? `${t('book.for')} ${b.for_name} • ` : ''}
            {b.starts_at ? b.starts_at.slice(0, 16).replace('T', ' ') : ''}
          </Text>
        </Pressable>
      ))}
      <Link href="/(client)/find" asChild>
        <Pressable style={styles.link}>
          <Text style={styles.linkText}>{t('book.find')}</Text>
        </Pressable>
      </Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  none: { opacity: 0.7 },
  row: { backgroundColor: '#FFFFFF', borderRadius: radius.md, padding: spacing.lg, gap: spacing.xs },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowTitle: { fontSize: 16, fontWeight: '700', color: colors.charcoal },
  rowSub: { fontSize: 13, color: colors.charcoal, opacity: 0.7 },
  chip: { fontSize: 12, fontWeight: '700', color: '#FFFFFF', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, overflow: 'hidden' },
  s_requested: { backgroundColor: colors.teal },
  s_accepted: { backgroundColor: colors.deepGreen },
  s_in_progress: { backgroundColor: colors.deepGreen },
  s_completed: { backgroundColor: colors.charcoal },
  s_cancelled: { backgroundColor: '#8A9B95' },
  s_expired: { backgroundColor: '#8A9B95' },
  s_declined: { backgroundColor: '#8A9B95' },
  s_disputed: { backgroundColor: colors.danger },
  s_other: { backgroundColor: '#8A9B95' },
  link: { padding: spacing.lg, alignItems: 'center' },
  linkText: { color: colors.deepGreen, fontWeight: '700' },
});
